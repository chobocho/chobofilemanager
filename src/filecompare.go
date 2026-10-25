package main

// 파일 내용 비교 (Ctrl+Shift+D, Todo #133-7): 텍스트면 프론트가 좌우 diff로, 바이너리면 첫 차이 위치만

import "bytes"

type FileCompareResult struct {
	Equal     bool  `json:"equal"`
	Binary    bool  `json:"binary"`    // 어느 한쪽이라도 앞부분에 NUL이 있으면
	FirstDiff int64 `json:"firstDiff"` // 처음 다른 바이트 위치, 같으면 -1
	SizeA     int64 `json:"sizeA"`
	SizeB     int64 `json:"sizeB"`
}

const binarySniff = 8 * 1024

// CompareFileBytes: 보통 파일 · 압축 파일 안의 파일 모두 (readLimited, 크기 제한은 뷰어와 같음)
func (fm *FileManager) CompareFileBytes(a, b string) (FileCompareResult, error) {
	da, err := readLimited(a)
	if err != nil {
		return FileCompareResult{}, err
	}
	db, err := readLimited(b)
	if err != nil {
		return FileCompareResult{}, err
	}
	r := FileCompareResult{SizeA: int64(len(da)), SizeB: int64(len(db)), FirstDiff: -1}
	sniff := func(d []byte) bool {
		if len(d) > binarySniff {
			d = d[:binarySniff]
		}
		return bytes.IndexByte(d, 0) >= 0
	}
	r.Binary = sniff(da) || sniff(db)
	n := len(da)
	if len(db) < n {
		n = len(db)
	}
	for i := 0; i < n; i++ {
		if da[i] != db[i] {
			r.FirstDiff = int64(i)
			return r, nil
		}
	}
	if len(da) != len(db) {
		r.FirstDiff = int64(n)
		return r, nil
	}
	r.Equal = true
	return r, nil
}
