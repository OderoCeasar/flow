package utils

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"math/big"
)

// refAlphabet leaves out characters people confuse when reading a code aloud
// or typing it on a phone (0/O, 1/I/L).
const refAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// RandomReferenceCode returns a report reference such as "FLW-7K3QPX".
func RandomReferenceCode() string {
	return "FLW-" + randomFrom(refAlphabet, 6)
}

// RandomOTP returns a six-digit one-time code.
func RandomOTP() string {
	return randomFrom("0123456789", 6)
}

// RandomToken returns a URL-safe random token with n bytes of entropy.
func RandomToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken returns the hex SHA-256 of a token, for storing secrets at rest.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomFrom(alphabet string, n int) string {
	out := make([]byte, n)
	max := big.NewInt(int64(len(alphabet)))
	for i := range out {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(err)
		}
		out[i] = alphabet[idx.Int64()]
	}
	return string(out)
}
