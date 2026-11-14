// Package imaging checks uploaded photos and re-encodes them. Re-encoding
// drops every piece of metadata (EXIF, GPS, camera serials) from the stored file.
package imaging

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"

	"github.com/rwcarlsen/goexif/exif"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	MaxUploadBytes = 10 << 20 // raw upload limit; the browser normally sends < 500 KB
	maxSide        = 2048
	jpegQuality    = 82
)

var (
	ErrTooLarge    = errors.New("photo is too large")
	ErrUnsupported = errors.New("unsupported photo type")
	ErrCorrupt     = errors.New("photo could not be read")
)

var allowed = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

type Result struct {
	Data []byte
	// GPS from the original EXIF, if present. Used only as a fallback location.
	Lat, Lng *float64
}

// Process validates by content (never the browser's claim), reads GPS, fixes
// orientation, downsizes, and returns a clean JPEG.
func Process(raw []byte) (Result, error) {
	if len(raw) > MaxUploadBytes {
		return Result{}, ErrTooLarge
	}
	if !allowed[http.DetectContentType(raw)] {
		return Result{}, ErrUnsupported
	}
	var res Result
	orientation := 1
	if x, err := exif.Decode(bytes.NewReader(raw)); err == nil {
		if lat, lng, err := x.LatLong(); err == nil {
			res.Lat, res.Lng = &lat, &lng
		}
		if tag, err := x.Get(exif.Orientation); err == nil {
			if v, err := tag.Int(0); err == nil {
				orientation = v
			}
		}
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return Result{}, ErrCorrupt
	}
	img = orient(img, orientation)
	img = fit(img, maxSide)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return Result{}, err
	}
	res.Data = out.Bytes()
	return res, nil
}

func fit(img image.Image, max int) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= max && h <= max {
		return img
	}
	if w > h {
		h, w = h*max/w, max
	} else {
		w, h = w*max/h, max
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
	return dst
}

// orient applies the EXIF orientation so the photo still looks right once the
// tag is gone. Only the rotations phones actually produce are handled.
func orient(img image.Image, o int) image.Image {
	b := img.Bounds()
	var dst *image.RGBA
	switch o {
	case 3: // 180°
		dst = image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				dst.Set(b.Max.X-1-x, b.Max.Y-1-y, img.At(x, y))
			}
		}
	case 6: // 90° clockwise
		dst = image.NewRGBA(image.Rect(0, 0, b.Dy(), b.Dx()))
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				dst.Set(b.Max.Y-1-y, x-b.Min.X, img.At(x, y))
			}
		}
	case 8: // 90° counter-clockwise
		dst = image.NewRGBA(image.Rect(0, 0, b.Dy(), b.Dx()))
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				dst.Set(y-b.Min.Y, b.Max.X-1-x, img.At(x, y))
			}
		}
	default:
		return img
	}
	return dst
}
