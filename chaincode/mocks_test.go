// Minimal mocks for unit-testing the chaincode without a running Fabric network.
//
// We embed the official interfaces so we only have to implement the methods the
// chaincode actually calls (GetState, PutState, SetEvent, GetQueryResult, +
// ClientIdentity.GetMSPID, GetAttributeValue). Any other interface method call
// will panic, which is exactly what we want in a test to surface unexpected usage.
package main

import (
	"crypto/x509"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"google.golang.org/protobuf/types/known/timestamppb"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-protos-go/ledger/queryresult"
)

// ───────────────────────── Stub ─────────────────────────

type mockStub struct {
	shim.ChaincodeStubInterface // embed — unimplemented methods will panic if called
	state  map[string][]byte
	events map[string][]byte
}

func newMockStub() *mockStub {
	return &mockStub{
		state:  make(map[string][]byte),
		events: make(map[string][]byte),
	}
}

func (m *mockStub) GetState(key string) ([]byte, error)        { return m.state[key], nil }
func (m *mockStub) PutState(key string, value []byte) error    { m.state[key] = append([]byte(nil), value...); return nil }
func (m *mockStub) DelState(key string) error                  { delete(m.state, key); return nil }
func (m *mockStub) SetEvent(name string, payload []byte) error { m.events[name] = payload; return nil }
func (m *mockStub) GetTxID() string                            { return "mock-tx" }
func (m *mockStub) GetChannelID() string                       { return "medichannel" }
func (m *mockStub) GetTxTimestamp() (*timestamppb.Timestamp, error) { return timestamppb.Now(), nil }

// GetQueryResult — full-scan over in-memory state, no CouchDB selector logic.
// Tests should rely on post-filtering the values returned.
func (m *mockStub) GetQueryResult(_ string) (shim.StateQueryIteratorInterface, error) {
	values := make([][]byte, 0, len(m.state))
	for _, v := range m.state {
		values = append(values, v)
	}
	return &mockIter{values: values}, nil
}

type mockIter struct {
	values [][]byte
	idx    int
}

func (it *mockIter) HasNext() bool { return it.idx < len(it.values) }
func (it *mockIter) Close() error  { return nil }
func (it *mockIter) Next() (*queryresult.KV, error) {
	if it.idx >= len(it.values) {
		return nil, fmt.Errorf("iterator exhausted")
	}
	v := it.values[it.idx]
	it.idx++
	return &queryresult.KV{Namespace: "medical", Key: fmt.Sprintf("k%d", it.idx), Value: v}, nil
}

// ───────────────────────── ClientIdentity ─────────────────────────

type mockCID struct {
	mspID string
	attrs map[string]string
}

func (m *mockCID) GetID() (string, error)                               { return "x509::mock", nil }
func (m *mockCID) GetMSPID() (string, error)                            { return m.mspID, nil }
func (m *mockCID) GetAttributeValue(k string) (string, bool, error)     { v, ok := m.attrs[k]; return v, ok, nil }
func (m *mockCID) AssertAttributeValue(k, val string) error {
	if v, ok := m.attrs[k]; ok && v == val {
		return nil
	}
	return fmt.Errorf("attr %s != %s", k, val)
}
func (m *mockCID) GetX509Certificate() (*x509.Certificate, error) { return nil, nil }

// ───────────────────────── TransactionContext ─────────────────────────

type mockCtx struct {
	contractapi.TransactionContextInterface // embedded — panics on any unimplemented call
	stub *mockStub
	cid  *mockCID
}

func (c *mockCtx) GetStub() shim.ChaincodeStubInterface          { return c.stub }
func (c *mockCtx) GetClientIdentity() cid.ClientIdentity { return c.cid }

// newCtx builds a context authenticated as a specific MSP with given DID + role.
func newCtx(mspID, did, role string) *mockCtx {
	return &mockCtx{
		stub: newMockStub(),
		cid: &mockCID{
			mspID: mspID,
			attrs: map[string]string{AttrDID: did, AttrRole: role},
		},
	}
}

// Helpers to seed / read state as JSON.
func (c *mockCtx) putJSON(key string, v interface{}) {
	b, _ := json.Marshal(v)
	_ = c.stub.PutState(key, b)
}
func (c *mockCtx) getJSON(key string, out interface{}) bool {
	b, _ := c.stub.GetState(key)
	if b == nil {
		return false
	}
	return json.Unmarshal(b, out) == nil
}
