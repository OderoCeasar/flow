package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestProcessReencodesAndRejectsNonImages(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 3000, 1500))
	for x := 0; x < 3000; x++ {
		src.Set(x, x%1500, color.RGBA{0, 100, 200, 255})
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, src, nil); err != nil {
		t.Fatal(err)
	}
	res, err := Process(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	img, err := jpeg.Decode(bytes.NewReader(res.Data))
	if err != nil {
		t.Fatal(err)
	}
	if b := img.Bounds(); b.Dx() != 2048 || b.Dy() != 1024 {
		t.Fatalf("want 2048x1024, got %dx%d", b.Dx(), b.Dy())
	}
	if _, err := Process([]byte("<html>not a photo</html>")); err != ErrUnsupported {
		t.Fatalf("want ErrUnsupported, got %v", err)
	}
}
