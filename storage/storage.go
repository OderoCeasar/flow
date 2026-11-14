// Package storage keeps report photos in private S3-compatible storage and
// hands out short-lived signed URLs for viewing them.
package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"flow/config"
)

type PhotoStore interface {
	Put(ctx context.Context, key string, data []byte, contentType string) error
	Get(ctx context.Context, key string) ([]byte, error)
	SignedURL(ctx context.Context, key string) (string, error)
}

type S3Store struct {
	client *minio.Client
	// signer only computes signatures for the public host browsers use; it
	// never makes network calls because the region is fixed.
	signer *minio.Client
	bucket string
	ttl    time.Duration
}

func NewS3Store(cfg config.Config) (*S3Store, error) {
	creds := credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, "")
	client, err := minio.New(cfg.S3Endpoint, &minio.Options{Creds: creds, Secure: cfg.S3Secure, Region: cfg.S3Region})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}
	signer, err := minio.New(cfg.S3PublicEndpoint, &minio.Options{Creds: creds, Secure: cfg.S3PublicSecure, Region: cfg.S3Region})
	if err != nil {
		return nil, fmt.Errorf("s3 signer: %w", err)
	}
	return &S3Store{client: client, signer: signer, bucket: cfg.S3Bucket, ttl: cfg.PhotoURLDuration}, nil
}

// EnsureBucket creates the private bucket on first start.
func (s *S3Store) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
}

func (s *S3Store) Put(ctx context.Context, key string, data []byte, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *S3Store) Get(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	return io.ReadAll(obj)
}

func (s *S3Store) SignedURL(ctx context.Context, key string) (string, error) {
	u, err := s.signer.PresignedGetObject(ctx, s.bucket, key, s.ttl, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
