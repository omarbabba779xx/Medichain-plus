package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type MediChainContract struct {
	contractapi.Contract
}

const (
	MSPHospital = "HospitalMSP"
	MSPPharmacy = "PharmacyMSP"
)

type Prescription struct {
	ID                string `json:"id"`
	PatientID         string `json:"patientId"`
	PatientEthAddress string `json:"patientEthAddress"` // adresse Ethereum pour le bridge relayer
	DoctorID          string `json:"doctorId"`
	Medication        string `json:"medication"`
	Dosage            string `json:"dosage"`
	Price             uint64 `json:"price"` // montant en USDC micro-unités (6 décimales)
	Hash              string `json:"hash"`  // sha256(id+patientId+medication) pour le bridge
	Status            string `json:"status"`
	IssuedAt          string `json:"issuedAt"`
	FilledAt          string `json:"filledAt,omitempty"`
	PharmacistMSP     string `json:"pharmacistMsp,omitempty"` // MSP dérivé du cert, non fourni par l'appelant
	DocType           string `json:"docType"`
}

type InsuranceClaim struct {
	ID             string `json:"id"`
	PrescriptionID string `json:"prescriptionId"`
	PatientID      string `json:"patientId"`
	Amount         uint64 `json:"amount"`
	Status         string `json:"status"`
	SubmittedAt    string `json:"submittedAt"`
	ProcessedAt    string `json:"processedAt,omitempty"`
	DocType        string `json:"docType"`
}

func getTxTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", fmt.Errorf("cannot get tx timestamp: %v", err)
	}
	return time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339), nil
}

func requireMSP(ctx contractapi.TransactionContextInterface, expected string) error {
	mspid, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("cannot get caller MSPID: %v", err)
	}
	if mspid != expected {
		return fmt.Errorf("unauthorized: requires %s, caller is %s", expected, mspid)
	}
	return nil
}

func (c *MediChainContract) IssuePrescription(
	ctx contractapi.TransactionContextInterface,
	id, patientId, patientEthAddress, doctorId, medication, dosage string,
	price uint64,
) error {
	if err := requireMSP(ctx, MSPHospital); err != nil {
		return err
	}
	existing, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("ledger read failed: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("prescription %s already exists", id)
	}
	issuedAt, err := getTxTime(ctx)
	if err != nil {
		return err
	}
	// Hash déterministe utilisé comme diagnosisHash par le bridge relayer
	h := sha256.Sum256([]byte(id + patientId + medication))
	rxHash := fmt.Sprintf("%x", h)

	prescription := Prescription{
		ID: id, PatientID: patientId, PatientEthAddress: patientEthAddress,
		DoctorID: doctorId, Medication: medication, Dosage: dosage,
		Price: price, Hash: rxHash,
		Status: "pending", IssuedAt: issuedAt, DocType: "prescription",
	}
	data, err := json.Marshal(prescription)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(id, data); err != nil {
		return err
	}
	// Émettre PrescriptionIssued — format attendu par bridge/relayer.js
	evPayload, _ := json.Marshal(map[string]interface{}{
		"rxId":           id,
		"patientAddress": patientEthAddress,
		"diagnosisHash":  rxHash,
		"amount":         price,
		"medication":     medication,
		"doctorId":       doctorId,
	})
	return ctx.GetStub().SetEvent("PrescriptionIssued", evPayload)
}

func (c *MediChainContract) FillPrescription(
	ctx contractapi.TransactionContextInterface,
	id string,
) error {
	if err := requireMSP(ctx, MSPPharmacy); err != nil {
		return err
	}
	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("ledger read failed: %v", err)
	}
	if data == nil {
		return fmt.Errorf("prescription %s not found", id)
	}
	var p Prescription
	if err := json.Unmarshal(data, &p); err != nil {
		return err
	}
	if p.Status != "pending" {
		return fmt.Errorf("prescription %s cannot be filled (status: %s)", id, p.Status)
	}
	filledAt, err := getTxTime(ctx)
	if err != nil {
		return err
	}
	// PharmacistMSP dérivé du certificat, jamais fourni par l'appelant (MINOR-06)
	mspid, _ := ctx.GetClientIdentity().GetMSPID()
	p.Status = "filled"
	p.PharmacistMSP = mspid
	p.FilledAt = filledAt
	updated, err := json.Marshal(p)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(id, updated); err != nil {
		return err
	}
	// Émettre PrescriptionDispensed — format attendu par bridge/relayer.js
	evPayload, _ := json.Marshal(map[string]interface{}{
		"prescriptionId": id,
		"diagnosisHash":  p.Hash,
		"patientAddress": p.PatientEthAddress,
		"dispenserMsp":   mspid,
	})
	return ctx.GetStub().SetEvent("PrescriptionDispensed", evPayload)
}

func (c *MediChainContract) GetPrescription(
	ctx contractapi.TransactionContextInterface,
	id string,
) (*Prescription, error) {
	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("ledger read failed: %v", err)
	}
	if data == nil {
		return nil, fmt.Errorf("prescription %s not found", id)
	}
	var p Prescription
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *MediChainContract) SubmitClaim(
	ctx contractapi.TransactionContextInterface,
	claimId, prescriptionId, patientId string,
	amount uint64,
) error {
	if err := requireMSP(ctx, MSPPharmacy); err != nil {
		return err
	}
	prescData, err := ctx.GetStub().GetState(prescriptionId)
	if err != nil || prescData == nil {
		return fmt.Errorf("prescription %s not found", prescriptionId)
	}
	var p Prescription
	if err := json.Unmarshal(prescData, &p); err != nil {
		return err
	}
	if p.Status != "filled" {
		return fmt.Errorf("claim rejected: prescription not filled (status: %s)", p.Status)
	}
	submittedAt, err := getTxTime(ctx)
	if err != nil {
		return err
	}
	claim := InsuranceClaim{
		ID: claimId, PrescriptionID: prescriptionId, PatientID: patientId,
		Amount: amount, Status: "pending", SubmittedAt: submittedAt, DocType: "claim",
	}
	data, err := json.Marshal(claim)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState("CLAIM_"+claimId, data)
}

func (c *MediChainContract) ApproveClaim(
	ctx contractapi.TransactionContextInterface,
	claimId string,
) error {
	mspid, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("cannot get caller MSPID: %v", err)
	}
	if mspid != MSPHospital && mspid != MSPPharmacy {
		return fmt.Errorf("ApproveClaim requires HospitalMSP or PharmacyMSP, got %s", mspid)
	}
	data, err := ctx.GetStub().GetState("CLAIM_" + claimId)
	if err != nil || data == nil {
		return fmt.Errorf("claim %s not found", claimId)
	}
	var claim InsuranceClaim
	if err := json.Unmarshal(data, &claim); err != nil {
		return err
	}
	if claim.Status != "pending" {
		return fmt.Errorf("claim %s already processed (status: %s)", claimId, claim.Status)
	}
	processedAt, err := getTxTime(ctx)
	if err != nil {
		return err
	}
	claim.Status = "approved"
	claim.ProcessedAt = processedAt
	updated, err := json.Marshal(claim)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState("CLAIM_"+claimId, updated)
}

func (c *MediChainContract) GetClaim(
	ctx contractapi.TransactionContextInterface,
	claimId string,
) (*InsuranceClaim, error) {
	data, err := ctx.GetStub().GetState("CLAIM_" + claimId)
	if err != nil || data == nil {
		return nil, fmt.Errorf("claim %s not found", claimId)
	}
	var claim InsuranceClaim
	if err := json.Unmarshal(data, &claim); err != nil {
		return nil, err
	}
	return &claim, nil
}

func main() {
	cc, err := contractapi.NewChaincode(new(MediChainContract))
	if err != nil {
		panic(fmt.Sprintf("chaincode creation error: %s", err))
	}
	if addr := os.Getenv("CHAINCODE_SERVER_ADDRESS"); addr != "" {
		server := &shim.ChaincodeServer{
			CCID: os.Getenv("CHAINCODE_ID"), Address: addr, CC: cc,
			TLSProps: shim.TLSProperties{Disabled: true},
		}
		if err := server.Start(); err != nil {
			panic(fmt.Sprintf("ccaas server error: %s", err))
		}
		return
	}
	if err := cc.Start(); err != nil {
		panic(fmt.Sprintf("chaincode start error: %s", err))
	}
}
