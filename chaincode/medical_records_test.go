// Unit tests for the MediChain+ chaincode.
//
// Coverage focus: identity-derived authorization.  Each test asserts that the
// ctx.GetClientIdentity() value is what gates the operation, regardless of the
// (malicious) arguments the caller might pass.
package main

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// ────────────────────────── helpers / auth ──────────────────────────

func TestRequireMSP_AllowsWhitelisted(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:hosp:1", "doctor")
	if err := requireMSP(ctx, MSPHospital, MSPLab); err != nil {
		t.Fatalf("expected Hospital to be allowed, got %v", err)
	}
	_ = sc
}

func TestRequireMSP_RejectsOutsider(t *testing.T) {
	ctx := newCtx("UnknownMSP", "did:x:1", "doctor")
	err := requireMSP(ctx, MSPHospital, MSPLab)
	if err == nil || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("expected access denied, got %v", err)
	}
}

func TestRequireCallerIsDID_MatchesCert(t *testing.T) {
	ctx := newCtx(MSPHospital, "did:indy:alice", "patient")
	if err := requireCallerIsDID(ctx, "did:indy:alice"); err != nil {
		t.Fatalf("expected match, got %v", err)
	}
}

func TestRequireCallerIsDID_RejectsMismatch(t *testing.T) {
	ctx := newCtx(MSPHospital, "did:indy:alice", "patient")
	err := requireCallerIsDID(ctx, "did:indy:eve") // trying to impersonate
	if err == nil || !strings.Contains(err.Error(), "identity mismatch") {
		t.Fatalf("expected identity mismatch, got %v", err)
	}
}

func TestRequireCallerIsDID_RejectsMissingAttribute(t *testing.T) {
	ctx := newCtx(MSPHospital, "", "patient") // no DID attr
	err := requireCallerIsDID(ctx, "did:indy:alice")
	if err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("expected missing attribute error, got %v", err)
	}
}

// ────────────────────────── CreateRecord ──────────────────────────

func TestCreateRecord_AllowedForHospital(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	err := sc.CreateRecord(ctx, "rec-1", "did:pat:salma", "glucose",
		"ipfs://x", "0xhash", "0xsig")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if _, ok := ctx.stub.events["RecordCreated"]; !ok {
		t.Fatalf("expected RecordCreated event to be emitted")
	}
}

func TestCreateRecord_BlocksUnauthorizedMSP(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPPharmacy, "did:pharm:1", "pharmacist")
	err := sc.CreateRecord(ctx, "rec-1", "did:pat:salma", "glucose",
		"ipfs://x", "0xhash", "0xsig")
	if err == nil || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("pharmacy should not create records, got %v", err)
	}
}

func TestCreateRecord_IssuerDerivedFromCert(t *testing.T) {
	sc := new(SmartContract)
	// Caller is Doctor Karim.  Even if the legacy-style call provided another
	// issuer, we want the stored issuer to be Karim (the cert-bound DID).
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	_ = sc.CreateRecord(ctx, "rec-2", "did:pat:salma", "glucose", "ipfs://x", "0xhash", "0xsig")

	var rec MedicalRecord
	if !ctx.getJSON("rec-2", &rec) {
		t.Fatalf("expected record to be stored")
	}
	if rec.Issuer != "did:doc:karim" {
		t.Fatalf("issuer must come from cert, got %q", rec.Issuer)
	}
}

func TestCreateRecord_RejectsWithoutDIDAttribute(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "", "doctor") // no DID attr
	err := sc.CreateRecord(ctx, "rec-3", "did:pat:salma", "glucose",
		"ipfs://x", "0xhash", "0xsig")
	if err == nil || !strings.Contains(err.Error(), "did") {
		t.Fatalf("expected DID-missing error, got %v", err)
	}
}

// ────────────────────────── GrantConsent ──────────────────────────

func TestGrantConsent_PatientDIDFromCert(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:pat:salma", "patient")
	future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)

	err := sc.GrantConsent(ctx, "c-1", "did:doc:karim", "read:all", future, "sig-bytes")
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}

	var c Consent
	if !ctx.getJSON("CONSENT_c-1", &c) {
		t.Fatalf("expected consent stored")
	}
	if c.PatientDID != "did:pat:salma" {
		t.Fatalf("patientDID must come from cert, got %q", c.PatientDID)
	}
	if c.Revoked {
		t.Fatalf("consent shouldn't start revoked")
	}
}

func TestGrantConsent_RejectsBadExpiry(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:pat:salma", "patient")
	err := sc.GrantConsent(ctx, "c-2", "did:doc:karim", "read:all", "not-a-date", "sig")
	if err == nil || !strings.Contains(err.Error(), "RFC3339") {
		t.Fatalf("expected RFC3339 error, got %v", err)
	}
}

func TestGrantConsent_RejectsEmptyGrantee(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:pat:salma", "patient")
	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	err := sc.GrantConsent(ctx, "c-3", "", "read:all", future, "sig")
	if err == nil || !strings.Contains(err.Error(), "granteeDID") {
		t.Fatalf("expected granteeDID error, got %v", err)
	}
}

// ────────────────────────── RevokeConsent ──────────────────────────

func seedConsent(t *testing.T, ctx *mockCtx, id, patientDID string) {
	t.Helper()
	c := Consent{
		DocType: "consent", ID: id, PatientDID: patientDID, GranteeDID: "did:doc:karim",
		Scope: "read:all", ExpiresAt: time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		Revoked: false, Signature: "sig", Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	ctx.putJSON("CONSENT_"+id, c)
}

func TestRevokeConsent_OnlyPatientCanRevoke(t *testing.T) {
	sc := new(SmartContract)
	// Patient Salma owns consent c-10
	owner := newCtx(MSPHospital, "did:pat:salma", "patient")
	seedConsent(t, owner, "c-10", "did:pat:salma")

	// Eve (another patient) tries to revoke using her cert
	eve := &mockCtx{stub: owner.stub, cid: &mockCID{mspID: MSPHospital, attrs: map[string]string{AttrDID: "did:pat:eve"}}}
	err := sc.RevokeConsent(eve, "c-10")
	if err == nil || !strings.Contains(err.Error(), "only the patient") {
		t.Fatalf("expected only-patient error, got %v", err)
	}

	// Salma herself can revoke
	if err := sc.RevokeConsent(owner, "c-10"); err != nil {
		t.Fatalf("owner should revoke, got %v", err)
	}
	var c Consent
	if !owner.getJSON("CONSENT_c-10", &c) || !c.Revoked {
		t.Fatalf("expected consent revoked")
	}
}

func TestRevokeConsent_AlreadyRevoked(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:pat:salma", "patient")
	seedConsent(t, ctx, "c-11", "did:pat:salma")
	_ = sc.RevokeConsent(ctx, "c-11")
	err := sc.RevokeConsent(ctx, "c-11")
	if err == nil || !strings.Contains(err.Error(), "already revoked") {
		t.Fatalf("expected already-revoked error, got %v", err)
	}
}

// ────────────────────────── IssuePrescription ──────────────────────────

func TestIssuePrescription_OnlyHospitalMSP(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPPharmacy, "did:pharm:1", "pharmacist")
	err := sc.IssuePrescription(ctx, "rx-1", "did:pat:salma", "Amoxicillin",
		"3x/day", "0xhash", "sig", 1500)
	if err == nil || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("pharmacy cannot issue prescriptions, got %v", err)
	}
}

func TestIssuePrescription_DoctorDIDFromCert(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	err := sc.IssuePrescription(ctx, "rx-2", "did:pat:salma", "Amoxicillin",
		"3x/day", "0xhash", "sig", 1500)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var rx Prescription
	if !ctx.getJSON("RX_rx-2", &rx) {
		t.Fatalf("prescription not stored")
	}
	if rx.DoctorDID != "did:doc:karim" {
		t.Fatalf("doctorDID must come from cert, got %q", rx.DoctorDID)
	}
}

func TestIssuePrescription_BlocksWrongRole(t *testing.T) {
	sc := new(SmartContract)
	// A nurse from the hospital MSP, not a doctor
	ctx := newCtx(MSPHospital, "did:nurse:1", "nurse")
	err := sc.IssuePrescription(ctx, "rx-3", "did:pat:salma", "Amoxicillin",
		"3x/day", "0xhash", "sig", 1500)
	if err == nil || !strings.Contains(err.Error(), "role mismatch") {
		t.Fatalf("expected role mismatch, got %v", err)
	}
}

func TestIssuePrescription_Idempotent(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	_ = sc.IssuePrescription(ctx, "rx-4", "did:pat:salma", "A", "d", "h", "s", 100)
	err := sc.IssuePrescription(ctx, "rx-4", "did:pat:salma", "A", "d", "h", "s", 100)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected already-exists error, got %v", err)
	}
}

// ────────────────────────── DispensePrescription ──────────────────────────

func TestDispensePrescription_OnlyPharmacyMSP(t *testing.T) {
	sc := new(SmartContract)
	// Seed a prescription as doctor
	doc := newCtx(MSPHospital, "did:doc:karim", "doctor")
	_ = sc.IssuePrescription(doc, "rx-d1", "did:pat:salma", "A", "d", "h", "s", 100)

	// Hospital user tries to dispense → should fail
	hospCtx := &mockCtx{stub: doc.stub, cid: &mockCID{mspID: MSPHospital, attrs: map[string]string{AttrDID: "did:doc:karim"}}}
	err := sc.DispensePrescription(hospCtx, "rx-d1")
	if err == nil || !strings.Contains(err.Error(), "access denied") {
		t.Fatalf("hospital cannot dispense, got %v", err)
	}

	// Pharmacy should succeed
	pharmCtx := &mockCtx{stub: doc.stub, cid: &mockCID{mspID: MSPPharmacy, attrs: map[string]string{AttrDID: "did:pharm:aldi"}}}
	if err := sc.DispensePrescription(pharmCtx, "rx-d1"); err != nil {
		t.Fatalf("pharmacy should dispense, got %v", err)
	}

	// Second dispense must fail
	err = sc.DispensePrescription(pharmCtx, "rx-d1")
	if err == nil || !strings.Contains(err.Error(), "already dispensed") {
		t.Fatalf("expected already-dispensed error, got %v", err)
	}
}

// ────────────────────────── WhoAmI ──────────────────────────

func TestWhoAmI(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	id, err := sc.WhoAmI(ctx)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if id["msp"] != MSPHospital || id["did"] != "did:doc:karim" || id["role"] != "doctor" {
		t.Fatalf("identity mismatch: %v", id)
	}
}

// Sanity check for compile-time consistency with constants.
// Note: MSPHospital and MSPLab both share "HospitalMSP" in the 2-org test network.
func TestMSPConstants(t *testing.T) {
	if MSPHospital != "HospitalMSP" {
		t.Errorf("MSPHospital = %q, want HospitalMSP", MSPHospital)
	}
	if MSPPharmacy != "PharmacyMSP" {
		t.Errorf("MSPPharmacy = %q, want PharmacyMSP", MSPPharmacy)
	}
	if AttrDID != "did" || AttrRole != "role" {
		t.Errorf("unexpected attr names: %s / %s", AttrDID, AttrRole)
	}
}

// Ensure that the test binary links with the main package (no hidden unused imports)
var _ = fmt.Sprintf("")
