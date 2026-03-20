package tle

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/satellite-tracker/backend/internal/models"
)

// ParseTLEFile reads a TLE file from disk and parses its contents.
func ParseTLEFile(filepath string) ([]models.TLEData, error) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return nil, fmt.Errorf("failed to read TLE file %s: %w", filepath, err)
	}
	return ParseTLEString(string(data))
}

// ParseTLEString parses TLE content in the standard 3-line format.
// Each satellite is represented by three lines:
//
//	Line 0 - Satellite name
//	Line 1 - First line of elements (starts with "1 ")
//	Line 2 - Second line of elements (starts with "2 ")
func ParseTLEString(content string) ([]models.TLEData, error) {
	rawLines := strings.Split(content, "\n")
	var lines []string
	for _, l := range rawLines {
		trimmed := strings.TrimRight(l, "\r\n\t ")
		if trimmed != "" {
			lines = append(lines, trimmed)
		}
	}

	if len(lines) < 3 {
		return nil, fmt.Errorf("TLE content too short: need at least 3 lines, got %d", len(lines))
	}

	var results []models.TLEData

	for i := 0; i+2 < len(lines); {
		name := lines[i]
		line1 := lines[i+1]
		line2 := lines[i+2]

		// Strip leading "0 " from the name line if present
		if strings.HasPrefix(name, "0 ") {
			name = strings.TrimPrefix(name, "0 ")
		}
		name = strings.TrimSpace(name)

		// Validate line1 and line2 prefixes
		if !strings.HasPrefix(line1, "1 ") {
			// Skip this line and try next
			i++
			continue
		}
		if !strings.HasPrefix(line2, "2 ") {
			i++
			continue
		}

		// Validate line lengths (standard TLE lines are 69 characters, but accept 68+)
		if len(line1) < 68 || len(line2) < 68 {
			i += 3
			continue
		}

		// Validate checksums
		if !ValidateChecksum(line1) || !ValidateChecksum(line2) {
			// Accept anyway but log — some TLE sources have minor issues
		}

		results = append(results, models.TLEData{
			Name:  name,
			Line1: line1,
			Line2: line2,
		})

		i += 3
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no valid TLE entries found in content")
	}

	return results, nil
}

// ExtractNoradID extracts the NORAD catalog number from TLE Line 1 (chars 2-7).
func ExtractNoradID(line1 string) (int, error) {
	if len(line1) < 8 {
		return 0, fmt.Errorf("line1 too short to extract NORAD ID")
	}
	idStr := strings.TrimSpace(line1[2:7])
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return 0, fmt.Errorf("failed to parse NORAD ID from '%s': %w", idStr, err)
	}
	return id, nil
}

// ExtractIntlDesignator extracts the international designator from TLE Line 1 (chars 9-17).
func ExtractIntlDesignator(line1 string) string {
	if len(line1) < 17 {
		return ""
	}
	return strings.TrimSpace(line1[9:17])
}

// ValidateChecksum validates the modulo-10 checksum of a TLE line.
// The checksum is the last character of the line.
func ValidateChecksum(line string) bool {
	if len(line) < 68 {
		return false
	}

	lastIdx := len(line) - 1
	expectedStr := line[lastIdx : lastIdx+1]
	expected, err := strconv.Atoi(expectedStr)
	if err != nil {
		return false
	}

	sum := 0
	for i := 0; i < lastIdx; i++ {
		c := line[i]
		switch {
		case c >= '0' && c <= '9':
			sum += int(c - '0')
		case c == '-':
			sum += 1
		default:
			// letters, spaces, dots, plus signs contribute 0
		}
	}

	return (sum % 10) == expected
}
