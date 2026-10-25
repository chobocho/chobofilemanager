package telnet

import (
	"bytes"
	"net"
	"testing"
)

// recConn records what the session writes.
type recConn struct {
	net.Conn
	out bytes.Buffer
}

func (c *recConn) Write(p []byte) (int, error) { return c.out.Write(p) }
func (c *recConn) Close() error                { return nil }

// Todo #130-2: answer a negotiation only when it changes an option (RFC 1143);
// answering an acknowledgment again lets a naive server ping-pong forever.
func TestNegotiationAnswersOnlyChanges(t *testing.T) {
	cases := []struct {
		name string
		in   [][2]byte // cmd, opt
		want []byte
	}{
		{"refused WILL then its WONT ack", [][2]byte{{tnWILL, 99}, {tnWONT, 99}},
			[]byte{tnIAC, tnDONT, 99}},
		{"WILL echo twice, WONT twice", [][2]byte{{tnWILL, optEcho}, {tnWILL, optEcho}, {tnWONT, optEcho}, {tnWONT, optEcho}},
			[]byte{tnIAC, tnDO, optEcho, tnIAC, tnDONT, optEcho}},
		{"DO SGA twice, DONT twice", [][2]byte{{tnDO, optSGA}, {tnDO, optSGA}, {tnDONT, optSGA}, {tnDONT, optSGA}},
			[]byte{tnIAC, tnWILL, optSGA, tnIAC, tnWONT, optSGA}},
		{"DONT for an option never on", [][2]byte{{tnDONT, optTType}},
			nil},
		{"unknown DO is refused each time", [][2]byte{{tnDO, 99}, {tnDO, 99}},
			[]byte{tnIAC, tnWONT, 99, tnIAC, tnWONT, 99}},
		{"DO NAWS twice sends the size once", [][2]byte{{tnDO, optNAWS}, {tnDO, optNAWS}},
			[]byte{tnIAC, tnWILL, optNAWS, tnIAC, tnSB, optNAWS, 0, 80, 0, 24, tnIAC, tnSE}},
	}
	for _, c := range cases {
		conn := &recConn{}
		ts := &Session{conn: conn, cols: 80, rows: 24, sentLogin: true, sentPass: true}
		for _, n := range c.in {
			ts.negotiate(n[0], n[1])
		}
		if !bytes.Equal(conn.out.Bytes(), c.want) {
			t.Errorf("%s:\n got %v\nwant %v", c.name, conn.out.Bytes(), c.want)
		}
	}
}

func TestBinaryAndNAWSFollowTheNegotiation(t *testing.T) {
	conn := &recConn{}
	ts := &Session{conn: conn, cols: 80, rows: 24, sentLogin: true, sentPass: true}
	ts.negotiate(tnDO, optBinary)
	if !ts.binary {
		t.Fatal("DO BINARY must turn binary on")
	}
	ts.negotiate(tnDONT, optBinary)
	if ts.binary {
		t.Fatal("DONT BINARY must turn binary off")
	}

	if err := ts.Resize(100, 30); err != nil || conn.out.Len() != 6 { // only WILL/WONT BINARY so far
		t.Fatalf("resize before NAWS must send nothing: %v %v", err, conn.out.Bytes())
	}
	ts.negotiate(tnDO, optNAWS)
	conn.out.Reset()
	ts.Resize(255, 40) // 255 is IAC and must be doubled
	want := []byte{tnIAC, tnSB, optNAWS, 0, 255, 255, 0, 40, tnIAC, tnSE}
	if !bytes.Equal(conn.out.Bytes(), want) {
		t.Fatalf("NAWS = %v want %v", conn.out.Bytes(), want)
	}
	ts.negotiate(tnDONT, optNAWS)
	conn.out.Reset()
	ts.Resize(90, 20)
	if conn.out.Len() != 0 {
		t.Fatalf("resize after DONT NAWS sent %v", conn.out.Bytes())
	}
}
