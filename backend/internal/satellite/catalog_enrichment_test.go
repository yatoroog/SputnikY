package satellite

import (
	"testing"

	"github.com/satellite-tracker/backend/internal/models"
)

func TestDetermineCountryWithMetadataPrefersResolvedOwner(t *testing.T) {
	t.Parallel()

	got, usedMetadata := determineCountryWithMetadata(
		"POISK",
		"09060A",
		models.CatalogMetadata{
			OwnerCode: "CIS",
			OwnerName: "Russia/CIS",
		},
	)

	if got != "Russia/CIS" {
		t.Fatalf("country = %q, want %q", got, "Russia/CIS")
	}
	if !usedMetadata {
		t.Fatal("expected metadata source to be used")
	}
}

func TestDetermineCountryWithMetadataFallsBackToHeuristic(t *testing.T) {
	t.Parallel()

	got, usedMetadata := determineCountryWithMetadata(
		"STARLINK-1234",
		"24001A",
		models.CatalogMetadata{
			OwnerCode: "UNK",
			OwnerName: "Unknown",
		},
	)

	if got != "USA" {
		t.Fatalf("country = %q, want %q", got, "USA")
	}
	if usedMetadata {
		t.Fatal("expected heuristic source to be used")
	}
}

func TestDetermineCountryWithMetadataFallsBackToOwnerCode(t *testing.T) {
	t.Parallel()

	got, usedMetadata := determineCountryWithMetadata(
		"MYSTERYSAT-1",
		"24001A",
		models.CatalogMetadata{
			OwnerCode: "ABC",
		},
	)

	if got != "ABC" {
		t.Fatalf("country = %q, want %q", got, "ABC")
	}
	if !usedMetadata {
		t.Fatal("expected metadata source to be used")
	}
}
