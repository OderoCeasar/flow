package sms

import "fmt"

// statusCopy is the SMS text for each status, in the reporter's language.
// Words match the app exactly ("Fixed", never "Resolved").
var statusCopy = map[string]map[string]string{
	"en": {
		"received":    "Flow: We got your leak report %s. We'll text you when it moves forward.",
		"verified":    "Flow: Your leak report %s has been checked and confirmed. Next step: scheduling a repair.",
		"scheduled":   "Flow: A repair crew has been scheduled for your leak report %s.",
		"in_progress": "Flow: The crew is working on the leak you reported (%s) now.",
		"fixed":       "Flow: The leak you reported (%s) is fixed. Thank you for helping save water!",
		"invalid":     "Flow: We looked at report %s and couldn't confirm a leak. Reason: %s",
	},
	"sw": {
		"received":    "Flow: Tumepokea ripoti yako ya uvujaji %s. Tutakutumia ujumbe hatua ikibadilika.",
		"verified":    "Flow: Ripoti yako %s imekaguliwa na kuthibitishwa. Hatua inayofuata: kupanga ukarabati.",
		"scheduled":   "Flow: Timu ya ukarabati imepangwa kwa ripoti yako %s.",
		"in_progress": "Flow: Timu inarekebisha uvujaji ulioripoti (%s) sasa hivi.",
		"fixed":       "Flow: Uvujaji ulioripoti (%s) umerekebishwa. Asante kwa kusaidia kuokoa maji!",
		"invalid":     "Flow: Tumeangalia ripoti %s na hatukuthibitisha uvujaji. Sababu: %s",
	},
}

// OTPMessage is the sign-in code text.
func OTPMessage(locale, code string) string {
	if locale == "sw" {
		return fmt.Sprintf("Flow: Nambari yako ya kuingia ni %s. Inaisha baada ya dakika 5. Usimpe mtu yeyote.", code)
	}
	return fmt.Sprintf("Flow: Your sign-in code is %s. It expires in 5 minutes. Don't share it with anyone.", code)
}

// StatusMessage returns the update text for a status, or "" when there is none.
func StatusMessage(locale, status, ref, note string) string {
	copy, ok := statusCopy[locale]
	if !ok {
		copy = statusCopy["en"]
	}
	tmpl, ok := copy[status]
	if !ok {
		return ""
	}
	if status == "invalid" {
		if note == "" {
			note = "-"
		}
		return fmt.Sprintf(tmpl, ref, note)
	}
	return fmt.Sprintf(tmpl, ref)
}
