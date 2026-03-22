package celestrak

import "testing"

func TestNormalizeIntlLaunchID(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
		want  string
	}{
		{name: "ISS", input: "98067A", want: "1998-067"},
		{name: "Nauka", input: "21066A", want: "2021-066"},
		{name: "Multi-letter piece", input: "11037PF", want: "2011-037"},
		{name: "Trim whitespace", input: " 09060A ", want: "2009-060"},
		{name: "Invalid short", input: "1234", want: ""},
		{name: "Invalid digits", input: "AB067A", want: ""},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := normalizeIntlLaunchID(tc.input)
			if got != tc.want {
				t.Fatalf("normalizeIntlLaunchID(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestOwnerDisplayName(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		code string
		want string
	}{
		{code: "US", want: "USA"},
		{code: "CIS", want: "Russia/CIS"},
		{code: "ISS", want: "International"},
		{code: "UNK", want: "Unknown"},
		{code: "MALA", want: "Malaysia"},
		{code: "ABC", want: "ABC"},
		{code: "", want: ""},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.code, func(t *testing.T) {
			t.Parallel()

			got := ownerDisplayName(tc.code)
			if got != tc.want {
				t.Fatalf("ownerDisplayName(%q) = %q, want %q", tc.code, got, tc.want)
			}
		})
	}
}
