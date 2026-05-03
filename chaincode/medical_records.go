// Package medicalrecords — Hyperledger Fabric chaincode pour MediChain+
// Gère : dossiers médicaux, consentements RGPD, ordonnances, traçabilité.
//
// Sécurité :
//   - Identité de l'appelant liée au certificat X.509 via ctx.GetClientIdentity().
//   - Attribut `did` (Fabric-CA) porté dans le cert et mappé à l'acteur métier.
//   - MSP ID validé pour les opérations sensibles (hôpital, pharmacie, assureur).
//   - Seul le patient peut révoquer ses consentements, seule la pharmacie peut dispenser.
package main

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

/* ---------------------- SIGNATURE VERIFICATION ---------------------- */

// PublicKeyRegistration — clé publique liée à un DID, déposée on-chain
// par le titulaire lors de son enrôlement. Sert de référence pour vérifier
// ultérieurement toute signature métier.
type PublicKeyRegistration struct {
	DocType   string `json:"docType"` // "pubkey"
	DID       string `json:"did"`
	PEM       string `json:"pem"` // clé publique X.509 PEM (ECDSA P-256)
	Algorithm string `json:"algorithm"`
	Timestamp string `json:"timestamp"`
}

// parseECDSAPublicKey décode un PEM SubjectPublicKeyInfo en *ecdsa.PublicKey.
func parseECDSAPublicKey(pemBytes []byte) (*ecdsa.PublicKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, fmt.Errorf("invalid PEM block")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse PKIX: %w", err)
	}
	ec, ok := pub.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("not an ECDSA public key")
	}
	return ec, nil
}

// verifySignatureForDID vérifie une signature ECDSA ASN.1 (ou raw r||s) contre
// la clé publique enregistrée pour `did`.  `signature` est attendu en base64.
// Échoue si aucune clé n'est enregistrée pour ce DID.
func verifySignatureForDID(
	ctx contractapi.TransactionContextInterface,
	did, message, signatureB64 string,
) error {
	if did == "" || message == "" || signatureB64 == "" {
		return fmt.Errorf("did, message and signature are required")
	}
	raw, err := ctx.GetStub().GetState("PK_" + did)
	if err != nil || raw == nil {
		return fmt.Errorf("no public key registered for %s", did)
	}
	var pk PublicKeyRegistration
	if err := json.Unmarshal(raw, &pk); err != nil {
		return fmt.Errorf("corrupt pubkey record: %w", err)
	}
	pub, err := parseECDSAPublicKey([]byte(pk.PEM))
	if err != nil {
		return err
	}
	sig, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return fmt.Errorf("signature must be base64: %w", err)
	}

	h := sha256.Sum256([]byte(message))

	// Try ASN.1 DER first (standard WebCrypto / openssl output)
	if ecdsa.VerifyASN1(pub, h[:], sig) {
		return nil
	}
	// Fallback : raw r||s of equal halves
	if len(sig)%2 == 0 && len(sig) >= 64 {
		half := len(sig) / 2
		r := new(big.Int).SetBytes(sig[:half])
		s := new(big.Int).SetBytes(sig[half:])
		if ecdsa.Verify(pub, h[:], r, s) {
			return nil
		}
	}
	return fmt.Errorf("invalid signature for %s", did)
}

// RegisterPublicKey — dépose la clé publique associée au DID appelant.
// L'identité Fabric doit correspondre au DID déclaré (anti-squat).
func (s *SmartContract) RegisterPublicKey(
	ctx contractapi.TransactionContextInterface,
	did, pemKey string,
) error {
	if err := requireCallerIsDID(ctx, did); err != nil {
		return err
	}
	if _, err := parseECDSAPublicKey([]byte(pemKey)); err != nil {
		return fmt.Errorf("invalid ECDSA public key: %w", err)
	}
	reg := PublicKeyRegistration{
		DocType:   "pubkey",
		DID:       did,
		PEM:       pemKey,
		Algorithm: "ECDSA-P256",
		Timestamp: func() string { t, _ := getTxTime(ctx); return t }(),
	}
	b, _ := json.Marshal(reg)
	return ctx.GetStub().PutState("PK_"+did, b)
}

// GetPublicKey — lecture publique du registre (pour debug/audit).
func (s *SmartContract) GetPublicKey(
	ctx contractapi.TransactionContextInterface, did string,
) (*PublicKeyRegistration, error) {
	raw, err := ctx.GetStub().GetState("PK_" + did)
	if err != nil || raw == nil {
		return nil, fmt.Errorf("no pubkey for %s", did)
	}
	var pk PublicKeyRegistration
	if err := json.Unmarshal(raw, &pk); err != nil {
		return nil, err
	}
	return &pk, nil
}

// Constantes MSP — alignées avec fabric-network/docker-compose.yaml et configtx.yaml
const (
	MSPHospital  = "HospitalMSP"  // Hôpital  (CORE_PEER_LOCALMSPID dans docker-compose)
	MSPLab       = "LabMSP"       // Laboratoire
	MSPPharmacy  = "PharmacyMSP"  // Pharmacie (CORE_PEER_LOCALMSPID dans docker-compose)
	MSPInsurer   = "InsurerMSP"   // Assureur
	AttrDID      = "did"          // attribut Fabric-CA mappant le cert à un DID
	AttrRole     = "role"         // "patient" | "doctor" | "pharmacist" | "insurer"
)

// SmartContract — chaincode principal
type SmartContract struct {
	contractapi.Contract
}


/* ---------------------- TIME HELPER --------------------------------- */

// getTxTime returns the deterministic transaction timestamp.
// CRITICAL-05: replaces time.Now() which differs across peers causing consensus failure.
func getTxTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("cannot get tx timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339), nil
}

/* ---------------------- IDENTITY HELPERS ----------------------------- */

// callerIdentity extrait l'identité authentifiée de l'appelant depuis le cert X.509.
// Retourne : mspID, DID (attribut), role (attribut), erreur.
// L'attribut `did` doit être émis par Fabric-CA lors de l'enrôlement du user.
func callerIdentity(ctx contractapi.TransactionContextInterface) (string, string, string, error) {
	cid := ctx.GetClientIdentity()
	mspID, err := cid.GetMSPID()
	if err != nil {
		return "", "", "", fmt.Errorf("cannot read caller MSPID: %w", err)
	}
	did, _, _ := cid.GetAttributeValue(AttrDID)
	role, _, _ := cid.GetAttributeValue(AttrRole)
	return mspID, did, role, nil
}

// requireMSP garantit que l'appelant appartient à l'un des MSP autorisés.
func requireMSP(ctx contractapi.TransactionContextInterface, allowed ...string) error {
	mspID, _, _, err := callerIdentity(ctx)
	if err != nil {
		return err
	}
	for _, m := range allowed {
		if mspID == m {
			return nil
		}
	}
	return fmt.Errorf("access denied: MSP %s not in allowed set %v", mspID, allowed)
}

// requireCallerIsDID garantit que le DID métier reçu en paramètre correspond
// bien à l'identité certifiée de l'appelant (anti-usurpation).
func requireCallerIsDID(ctx contractapi.TransactionContextInterface, claimedDID string) error {
	_, callerDID, _, err := callerIdentity(ctx)
	if err != nil {
		return err
	}
	if callerDID == "" {
		return fmt.Errorf("caller certificate missing '%s' attribute", AttrDID)
	}
	if callerDID != claimedDID {
		return fmt.Errorf("identity mismatch: caller DID %s cannot act as %s", callerDID, claimedDID)
	}
	return nil
}

// MedicalRecord — entrée DME stockée sur Fabric (hash + métadonnées,
// le contenu chiffré reste off-chain sur IPFS).
type MedicalRecord struct {
	DocType    string `json:"docType"` // "record"
	ID         string `json:"id"`
	PatientDID string `json:"patientDID"`
	Type       string `json:"type"` // ex: "glucose", "prescription", "lab_result"
	IPFSHash   string `json:"ipfsHash"`
	DataHash   string `json:"dataHash"`  // SHA-256 du contenu
	Signature  string `json:"signature"` // ECDSA signée par l'émetteur
	Issuer     string `json:"issuer"`    // DID du médecin/capteur
	Timestamp  string `json:"timestamp"`
}

// Consent — consentement RGPD granulaire
type Consent struct {
	DocType    string `json:"docType"` // "consent"
	ID         string `json:"id"`
	PatientDID string `json:"patientDID"`
	GranteeDID string `json:"granteeDID"`
	Scope      string `json:"scope"`     // ex: "read:all", "read:lab"
	ExpiresAt  string `json:"expiresAt"` // RFC3339
	Revoked    bool   `json:"revoked"`
	Signature  string `json:"signature"`
	Timestamp  string `json:"timestamp"`
}

// Prescription — ordonnance signée par le médecin
type Prescription struct {
	DocType    string `json:"docType"` // "prescription"
	ID         string `json:"id"`
	PatientDID string `json:"patientDID"`
	DoctorDID  string `json:"doctorDID"`
	Medication string `json:"medication"`
	Dosage     string `json:"dosage"`
	Price      uint64 `json:"price"` // en cents d'USDC
	Hash       string `json:"hash"`  // hash pour pont Ethereum
	Signature  string `json:"signature"`
	Dispensed  bool   `json:"dispensed"`
	Timestamp  string `json:"timestamp"`
}

/* ----------------------------- INIT -------------------------------- */

// InitLedger — bootstrap de démonstration
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	return nil
}

/* ------------------------- MEDICAL RECORDS ------------------------- */

// CreateRecord — ajoute une entrée DME.
// Autorisation : seul un membre d'Org1 (hôpital), Org2 (labo) peut créer un record.
// L'issuer est dérivé du certificat de l'appelant (pas un input tiers).
func (s *SmartContract) CreateRecord(
	ctx contractapi.TransactionContextInterface,
	id, patientDID, recordType, ipfsHash, dataHash, signature string,
) error {
	if err := requireMSP(ctx, MSPHospital, MSPLab); err != nil {
		return err
	}
	mspID, issuerDID, _, err := callerIdentity(ctx)
	if err != nil {
		return err
	}
	if issuerDID == "" {
		return fmt.Errorf("issuer certificate must carry a '%s' attribute", AttrDID)
	}

	exists, err := s.recordExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("record %s already exists", id)
	}

	record := MedicalRecord{
		DocType:    "record",
		ID:         id,
		PatientDID: patientDID,
		Type:       recordType,
		IPFSHash:   ipfsHash,
		DataHash:   dataHash,
		Signature:  signature,
		Issuer:     issuerDID, // dérivé du cert, pas de l'input
		Timestamp: func() string { t, _ := getTxTime(ctx); return t }(),
	}

	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(id, data); err != nil {
		return err
	}
	// Event capté par le bridge off-chain (audit, notifications)
	eventPayload, _ := json.Marshal(map[string]string{
		"id": id, "patientDID": patientDID, "issuerDID": issuerDID, "issuerMSP": mspID,
	})
	return ctx.GetStub().SetEvent("RecordCreated", eventPayload)
}

// ReadRecord — lecture si consentement valide.
// Le requesterDID est dérivé du cert de l'appelant (anti-usurpation).
func (s *SmartContract) ReadRecord(
	ctx contractapi.TransactionContextInterface,
	id string,
) (*MedicalRecord, error) {
	_, requesterDID, _, err := callerIdentity(ctx)
	if err != nil {
		return nil, err
	}
	if requesterDID == "" {
		return nil, fmt.Errorf("caller certificate missing '%s' attribute", AttrDID)
	}

	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, err
	}
	if data == nil {
		return nil, fmt.Errorf("record %s not found", id)
	}

	var rec MedicalRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, err
	}

	// Le patient lui-même a toujours accès
	if requesterDID != rec.PatientDID {
		ok, err := s.hasValidConsent(ctx, rec.PatientDID, requesterDID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("access denied: no valid consent for %s on patient %s", requesterDID, rec.PatientDID)
		}
	}
	return &rec, nil
}

func (s *SmartContract) recordExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, err
	}
	return data != nil, nil
}

/* ------------------------------ CONSENTS --------------------------- */

// GrantConsent — le patient signe un consentement.
// Autorisation : seul le patient lui-même (cert dont DID == patientDID demandé) peut accorder.
// Le patientDID est dérivé du cert → impossible de signer au nom d'un autre.
func (s *SmartContract) GrantConsent(
	ctx contractapi.TransactionContextInterface,
	id, granteeDID, scope, expiresAt, signature string,
) error {
	_, patientDID, _, err := callerIdentity(ctx)
	if err != nil {
		return err
	}
	if patientDID == "" {
		return fmt.Errorf("caller certificate must carry a '%s' attribute", AttrDID)
	}
	if granteeDID == "" || granteeDID == patientDID {
		return fmt.Errorf("invalid granteeDID: %q", granteeDID)
	}
	// Validation basique de la fenêtre d'expiration
	if _, err := time.Parse(time.RFC3339, expiresAt); err != nil {
		return fmt.Errorf("expiresAt must be RFC3339: %w", err)
	}
	if signature == "" {
		return fmt.Errorf("signature is required")
	}

	// If patient has registered a public key, verify the signature cryptographically.
	// Message is the canonical consent payload (deterministic across clients).
	msg := fmt.Sprintf("CONSENT|%s|%s|%s|%s|%s", id, patientDID, granteeDID, scope, expiresAt)
	if raw, _ := ctx.GetStub().GetState("PK_" + patientDID); raw != nil {
		if err := verifySignatureForDID(ctx, patientDID, msg, signature); err != nil {
			return fmt.Errorf("signature rejected: %w", err)
		}
	}
	// else: no pubkey registered yet — legacy/bootstrap mode, signature stored as evidence.

	c := Consent{
		DocType:    "consent",
		ID:         id,
		PatientDID: patientDID, // dérivé du cert
		GranteeDID: granteeDID,
		Scope:      scope,
		ExpiresAt:  expiresAt,
		Revoked:    false,
		Signature:  signature,
		Timestamp: func() string { t, _ := getTxTime(ctx); return t }(),
	}
	data, _ := json.Marshal(c)
	if err := ctx.GetStub().PutState("CONSENT_"+id, data); err != nil {
		return err
	}
	return ctx.GetStub().SetEvent("ConsentGranted", data)
}

// RevokeConsent — révocation immédiate.
// Autorisation : SEUL le patient titulaire du consentement peut le révoquer.
func (s *SmartContract) RevokeConsent(
	ctx contractapi.TransactionContextInterface, id string,
) error {
	data, err := ctx.GetStub().GetState("CONSENT_" + id)
	if err != nil || data == nil {
		return fmt.Errorf("consent %s not found", id)
	}
	var c Consent
	if err := json.Unmarshal(data, &c); err != nil {
		return err
	}
	// Vérifie que l'appelant est bien le patient titulaire
	if err := requireCallerIsDID(ctx, c.PatientDID); err != nil {
		return fmt.Errorf("only the patient can revoke their consent: %w", err)
	}
	if c.Revoked {
		return fmt.Errorf("consent %s already revoked", id)
	}
	c.Revoked = true
	if ts, err := getTxTime(ctx); err == nil { c.Timestamp = ts }
	upd, _ := json.Marshal(c)
	if err := ctx.GetStub().PutState("CONSENT_"+id, upd); err != nil {
		return err
	}
	return ctx.GetStub().SetEvent("ConsentRevoked", upd)
}

func (s *SmartContract) hasValidConsent(
	ctx contractapi.TransactionContextInterface, patientDID, granteeDID string,
) (bool, error) {
	iter, err := ctx.GetStub().GetQueryResult(fmt.Sprintf(
		`{"selector":{"docType":"consent","patientDID":"%s","granteeDID":"%s","revoked":false}}`,
		patientDID, granteeDID,
	))
	if err != nil {
		return false, err
	}
	defer iter.Close()

	txts, _ := ctx.GetStub().GetTxTimestamp(); now := time.Unix(txts.Seconds, int64(txts.Nanos)).UTC()
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			continue
		}
		var c Consent
		if json.Unmarshal(kv.Value, &c) != nil {
			continue
		}
		exp, err := time.Parse(time.RFC3339, c.ExpiresAt)
		if err == nil && exp.After(now) {
			return true, nil
		}
	}
	return false, nil
}

/* --------------------------- PRESCRIPTIONS ------------------------- */

// IssuePrescription — le médecin signe une ordonnance.
// Autorisation : seul un membre d'Org1 (hôpital) peut émettre.
// Le doctorDID est dérivé du cert de l'appelant, pas fourni en paramètre.
func (s *SmartContract) IssuePrescription(
	ctx contractapi.TransactionContextInterface,
	id, patientDID, med, dosage, hash, signature string,
	price uint64,
) error {
	if err := requireMSP(ctx, MSPHospital); err != nil {
		return err
	}
	_, doctorDID, role, err := callerIdentity(ctx)
	if err != nil {
		return err
	}
	if doctorDID == "" {
		return fmt.Errorf("caller certificate must carry a '%s' attribute", AttrDID)
	}
	if role != "" && role != "doctor" {
		return fmt.Errorf("role mismatch: only 'doctor' can issue prescriptions, got %q", role)
	}
	if patientDID == "" || med == "" || signature == "" {
		return fmt.Errorf("patientDID, medication and signature are required")
	}

	// Idempotence : refuse si déjà existante
	if existing, _ := ctx.GetStub().GetState("RX_" + id); existing != nil {
		return fmt.Errorf("prescription %s already exists", id)
	}

	// Optional strong check : verify the doctor's signature if their pubkey is on-chain.
	msg := fmt.Sprintf("RX|%s|%s|%s|%s|%s|%d", id, patientDID, doctorDID, med, dosage, price)
	if raw, _ := ctx.GetStub().GetState("PK_" + doctorDID); raw != nil {
		if err := verifySignatureForDID(ctx, doctorDID, msg, signature); err != nil {
			return fmt.Errorf("doctor signature rejected: %w", err)
		}
	}

	rx := Prescription{
		DocType:    "prescription",
		ID:         id,
		PatientDID: patientDID,
		DoctorDID:  doctorDID, // dérivé du cert
		Medication: med,
		Dosage:     dosage,
		Price:      price,
		Hash:       hash,
		Signature:  signature,
		Dispensed:  false,
		Timestamp: func() string { t, _ := getTxTime(ctx); return t }(),
	}
	data, _ := json.Marshal(rx)
	if err := ctx.GetStub().PutState("RX_"+id, data); err != nil {
		return err
	}
	// Event capté par le bridge → relayé vers le smart contract Ethereum
	return ctx.GetStub().SetEvent("PrescriptionIssued", data)
}

// DispensePrescription — la pharmacie marque l'ordonnance comme délivrée.
// Autorisation : seul un membre d'Org3 (pharmacie) peut dispenser.
// Trace le dispenser DID pour audit.
func (s *SmartContract) DispensePrescription(
	ctx contractapi.TransactionContextInterface, id string,
) error {
	if err := requireMSP(ctx, MSPPharmacy); err != nil {
		return err
	}
	_, dispenserDID, _, err := callerIdentity(ctx)
	if err != nil {
		return err
	}

	data, err := ctx.GetStub().GetState("RX_" + id)
	if err != nil || data == nil {
		return fmt.Errorf("prescription %s not found", id)
	}
	var rx Prescription
	if err := json.Unmarshal(data, &rx); err != nil {
		return err
	}
	if rx.Dispensed {
		return fmt.Errorf("prescription %s already dispensed", id)
	}
	rx.Dispensed = true
	if ts, err := getTxTime(ctx); err == nil { rx.Timestamp = ts }
	upd, _ := json.Marshal(rx)
	if err := ctx.GetStub().PutState("RX_"+id, upd); err != nil {
		return err
	}
	eventPayload, _ := json.Marshal(map[string]string{
		"prescriptionId": id, "dispenserDID": dispenserDID, "patientDID": rx.PatientDID,
		"medication": rx.Medication, "timestamp": rx.Timestamp,
	})
	return ctx.GetStub().SetEvent("PrescriptionDispensed", eventPayload)
}

// WhoAmI — helper pour le debug / la démo : renvoie l'identité authentifiée.
func (s *SmartContract) WhoAmI(ctx contractapi.TransactionContextInterface) (map[string]string, error) {
	mspID, did, role, err := callerIdentity(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]string{"msp": mspID, "did": did, "role": role}, nil
}

/* ------------------------------- MAIN ------------------------------ */

func main() {
	cc, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		fmt.Printf("chaincode init error: %v\n", err)
		return
	}
	if err := cc.Start(); err != nil {
		fmt.Printf("chaincode start error: %v\n", err)
	}
}
