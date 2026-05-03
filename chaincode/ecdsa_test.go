// Real ECDSA signature round-trip test: generate a P-256 keypair, sign a canonical
// consent / prescription message, register the pubkey on-chain, then verify that
// the chaincode accepts the valid signature and rejects a tampered one.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"testing"
	"time"
)

func genECDSAKeypair(t *testing.T) (*ecdsa.PrivateKey, string) {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	der, _ := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	return priv, string(pemBytes)
}

func signB64(t *testing.T, priv *ecdsa.PrivateKey, msg string) string {
	t.Helper()
	h := sha256.Sum256([]byte(msg))
	sig, err := ecdsa.SignASN1(rand.Reader, priv, h[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return base64.StdEncoding.EncodeToString(sig)
}

func TestRegisterPublicKey_RequiresIdentityMatch(t *testing.T) {
	sc := new(SmartContract)
	_, pemKey := genECDSAKeypair(t)

	// Caller claims Alice but cert says Bob → reject
	ctx := newCtx(MSPHospital, "did:pat:bob", "patient")
	err := sc.RegisterPublicKey(ctx, "did:pat:alice", pemKey)
	if err == nil || !strings.Contains(err.Error(), "identity mismatch") {
		t.Fatalf("expected identity mismatch, got %v", err)
	}
}

func TestRegisterAndGetPublicKey(t *testing.T) {
	sc := new(SmartContract)
	_, pemKey := genECDSAKeypair(t)
	ctx := newCtx(MSPHospital, "did:pat:alice", "patient")

	if err := sc.RegisterPublicKey(ctx, "did:pat:alice", pemKey); err != nil {
		t.Fatalf("register: %v", err)
	}
	got, err := sc.GetPublicKey(ctx, "did:pat:alice")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Algorithm != "ECDSA-P256" || got.DID != "did:pat:alice" {
		t.Fatalf("unexpected pubkey reg: %+v", got)
	}
}

func TestGrantConsent_AcceptsValidECDSASignature(t *testing.T) {
	sc := new(SmartContract)
	priv, pemKey := genECDSAKeypair(t)
	ctx := newCtx(MSPHospital, "did:pat:alice", "patient")

	// 1) Alice registers her pubkey
	if err := sc.RegisterPublicKey(ctx, "did:pat:alice", pemKey); err != nil {
		t.Fatalf("register: %v", err)
	}

	// 2) Alice signs the canonical consent message
	expires := time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)
	msg := fmt.Sprintf("CONSENT|c-99|did:pat:alice|did:doc:karim|read:all|%s", expires)
	sig := signB64(t, priv, msg)

	// 3) GrantConsent must accept the valid signature
	if err := sc.GrantConsent(ctx, "c-99", "did:doc:karim", "read:all", expires, sig); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
}

func TestGrantConsent_RejectsTamperedSignature(t *testing.T) {
	sc := new(SmartContract)
	priv, pemKey := genECDSAKeypair(t)
	ctx := newCtx(MSPHospital, "did:pat:alice", "patient")

	_ = sc.RegisterPublicKey(ctx, "did:pat:alice", pemKey)

	expires := time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)

	// Sign a *different* message, then present it as if it were for a real consent
	otherMsg := "CONSENT|c-100|did:pat:alice|did:doc:eve|read:all|" + expires
	tampered := signB64(t, priv, otherMsg)

	// Submit with the real consent args → signature won't match the canonical msg
	err := sc.GrantConsent(ctx, "c-100", "did:doc:karim", "read:all", expires, tampered)
	if err == nil || !strings.Contains(err.Error(), "signature rejected") {
		t.Fatalf("expected signature rejection, got %v", err)
	}
}

func TestGrantConsent_SkipsVerificationWhenNoKey(t *testing.T) {
	sc := new(SmartContract)
	ctx := newCtx(MSPHospital, "did:pat:alice", "patient")

	// No RegisterPublicKey call → legacy/bootstrap mode, still accepts
	expires := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	if err := sc.GrantConsent(ctx, "c-101", "did:doc:karim", "read:all", expires, "legacy-sig"); err != nil {
		t.Fatalf("bootstrap mode should accept, got %v", err)
	}
}

func TestIssuePrescription_AcceptsValidECDSASignature(t *testing.T) {
	sc := new(SmartContract)
	priv, pemKey := genECDSAKeypair(t)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")

	if err := sc.RegisterPublicKey(ctx, "did:doc:karim", pemKey); err != nil {
		t.Fatalf("register: %v", err)
	}

	msg := "RX|rx-sig|did:pat:alice|did:doc:karim|Amoxicillin|3x/day|1500"
	sig := signB64(t, priv, msg)

	if err := sc.IssuePrescription(ctx, "rx-sig", "did:pat:alice",
		"Amoxicillin", "3x/day", "0xhash", sig, 1500); err != nil {
		t.Fatalf("valid prescription signature rejected: %v", err)
	}
}

func TestIssuePrescription_RejectsInvalidSignature(t *testing.T) {
	sc := new(SmartContract)
	_, pemKey := genECDSAKeypair(t)
	ctx := newCtx(MSPHospital, "did:doc:karim", "doctor")
	_ = sc.RegisterPublicKey(ctx, "did:doc:karim", pemKey)

	err := sc.IssuePrescription(ctx, "rx-bad", "did:pat:alice",
		"Amoxicillin", "3x/day", "0xhash", "bm90LWEtc2ln", 1500) // "not-a-sig" in b64
	if err == nil || !strings.Contains(err.Error(), "signature rejected") {
		t.Fatalf("expected rejection, got %v", err)
	}
}
