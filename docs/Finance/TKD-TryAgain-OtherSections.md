# Other sections: failure sentences that still say "try again"

Made 2026-11-08 by the Finance session for the Main session (Jeffrey: "Yes, small batch" aligned only Finance's own sentences to the shared "retry"; these were left alone, as asked).

Shared wording (src/components/text.js, rulebook v1.051 (2)): "... Check the connection, then retry." Found by searching every `.js` / `.jsx` file under `src/` (outside Finance) for a line with "try again" and a failure word. Lines that are code comments are marked (comment). The public family forms (`register`, `camp`, `blackBelt/form`, `forms`, `star-register`) say "try again" on purpose: a family-facing sentence next to a "Try again" button, a different wording from the staff screens'; they are listed last.

| File | Sentences |
|---|---|
| **staff screens** | |
| `src/App.jsx` | 0 sentences (+2 comments) |
| `src/blackBelt/staff/grading/MakeupSubjectsDialog.jsx` | 0 sentences (+1 comment) |
| `src/blackBelt/staff/grading/text.js` | 1 sentence |
| `src/blackBelt/staff/grading/useBbGradingSaves.js` | 1 sentence |
| `src/blackBelt/staff/results/text.js` | 11 sentences |
| `src/blackBelt/staff/text.js` | 7 sentences |
| `src/components/text.js` | 1 sentence |
| `src/lib/star/candidatesText.js` | 2 sentences |
| `src/lib/star/eventsText.js` | 5 sentences |
| `src/lib/star/gradingText.js` | 2 sentences |
| `src/lib/star/resultsText.js` | 7 sentences |
| `src/parts/M1.jsx` | 1 sentence |
| `src/parts/M2.jsx` | 1 sentence |
| `src/screens/ChangePasswordDialog.jsx` | 2 sentences |
| `src/screens/ChangePinDialog.jsx` | 2 sentences |
| `src/screens/LockScreen.jsx` | 1 sentence |
| `src/screens/SetPinScreen.jsx` | 1 sentence |
| `src/screens/SignIn.jsx` | 1 sentence |
| `src/screens/calendar/text.js` | 4 sentences |
| `src/screens/camps/text.js` | 3 sentences |
| `src/screens/forms/text.js` | 7 sentences |
| `src/screens/prospects/text.js` | 8 sentences |
| `src/screens/schedule/text.js` | 6 sentences |
| `src/screens/settings/text.js` | 2 sentences |
| `src/screens/staff/text.js` | 3 sentences |
| `src/screens/testing/star/candidates/text.js` | 2 sentences |
| `src/screens/testing/star/grading/MakeupChoiceDialog.jsx` | 0 sentences (+1 comment) |
| `src/screens/testing/star/grading/text.js` | 2 sentences |
| `src/screens/testing/star/text.js` | 3 sentences |
| `src/screens/testing/text.js` | 8 sentences (+1 comment) |
| **public family forms** | |
| `src/blackBelt/form/StepCheck.jsx` | 1 sentence |
| `src/blackBelt/form/text.js` | 3 sentences |
| `src/camp/CampApp.jsx` | 0 sentences (+1 comment) |
| `src/camp/StepCheck.jsx` | 1 sentence |
| `src/camp/text.js` | 3 sentences |
| `src/forms/text.js` | 2 sentences |
| `src/register/RegisterApp.jsx` | 0 sentences (+1 comment) |
| `src/register/StepCheck.jsx` | 1 sentence |
| `src/register/text.js` | 3 sentences |
| `src/star-register/StepCheck.jsx` | 1 sentence (+2 comments) |
| `src/star-register/text.js` | 3 sentences |

## The sentences

### `src/App.jsx`
- // If telling the database "lock this sign-in" fails (offline), try again this often until it works.  (line 153)
- // never waits for this. If the call fails (offline), try again as soon as the browser says it's  (line 580)

### `src/blackBelt/form/StepCheck.jsx`
- hasTried, // a Send failed before → the button says "Try again"  (line 54)

### `src/blackBelt/form/text.js`
- export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';  (line 118)
- export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.';  (line 119)
- export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.';  (line 232)

### `src/blackBelt/staff/grading/MakeupSubjectsDialog.jsx`
- // error "Couldn't save. Check the connection, then try again." (Save stays)  (line 29)

### `src/blackBelt/staff/grading/text.js`
- export const LOAD_GRADES_FAILED = 'Couldn’t load the grades. Check the connection, then try again.'; // Star v0.513's line  (line 65)

### `src/blackBelt/staff/grading/useBbGradingSaves.js`
- else what = 'retry'; // still there (a rare lock hiccup) or couldn't tell: try again later  (line 210)

### `src/blackBelt/staff/results/text.js`
- export const OFFLINE_WHY_BUTTONS = 'Print results and Download CSV are off while you’re offline. Try again when the connection is back.';  (line 106)
- export const OFFLINE_WHY_ROWS = 'Email result and Mark as sent are off while you’re offline. Try again when the connection is back.';  (line 107)
- export const LOAD_FAILED = 'Couldn’t load the results. Check the connection, then try again.'; // + Retry  (line 112)
- export const addressFailed = (name) => `Couldn’t get ${name}’s email address. Check the connection, then try again.`; // + Retry  (line 119)
- export const MESSAGE_NOT_READY = 'Couldn’t build the message. Check the connection, then try again.'; // new wording, not in the mockups (Star's)  (line 120)
- default: return `Couldn’t mark ${name} as sent. Check the connection, then try again.`; // + Retry  (line 144)
- default: return 'Couldn’t undo Mark as sent. Check the connection, then try again.';  (line 153)
- export const PRINT_FAILED = 'Couldn’t load the results to print. Check the connection, then try again.'; // new wording, not in the mockups (+ Retry)  (line 165)
- export const CSV_FAILED = 'Couldn’t download the CSV. Check the connection, then try again.'; // + Retry  (line 168)
- export const TEXTS_LOAD_FAILED = 'Couldn’t load the result emails. Check the connection, then try again.'; // new wording, not in the mockups (+ Retry  (line 217)
- export const TEXT_SAVE_FAILED = 'Couldn’t save. Check the connection, then try again.';  (line 249)

### `src/blackBelt/staff/text.js`
- export const INVALID = "That didn't save. Check the fields and try again.";  (line 84)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 85)
- export const LOAD_FAILED_NO_RETRY = "Couldn't load. Check the connection, then try again.";  (line 90)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again."; // (not in the mockups)  (line 91)
- export const ACTION_FAILED = "That didn't work. Check the connection, then try again."; // a toast Undo or a one-click action (not in the mockups)  (line 618)
- export const UNDO_BOX_FAILED = "Couldn't undo. Check the connection, then try again."; // under an Undo box's buttons (Star's words)  (line 864)
- export const RUBRIC_LOAD_FAILED = "Couldn't load the rubric. Check the connection, then try again."; // (new wording, not in the mockups)  (line 1027)

### `src/camp/CampApp.jsx`
- // again, e.g. price_changed); true makes it say "Try again" (the send itself failed).  (line 209)

### `src/camp/StepCheck.jsx`
- hasTried, // a send failed before → the button says "Try again"  (line 36)

### `src/camp/text.js`
- export const SEND_FAILED = 'Your sign-up wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.'; // (§7.3)  (line 131)
- export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.'; // (Color Belt)  (line 132)
- export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.'; // (§7.3)  (line 163)

### `src/components/text.js`
- export const QR_FAILED = "Couldn't make the QR code picture. Try again.";  (line 87)

### `src/forms/text.js`
- export const RATE_LIMITED = 'Too many tries from this connection. Please wait a few minutes and try again.';  (line 29)
- export const LOAD_FAILED_TEXT = 'Check the connection and try again.';  (line 111)

### `src/lib/star/candidatesText.js`
- export const DIALOG_INVALID = "That didn't save. Check the fields and try again.";  (line 36)
- export const DIALOG_FAILED = "Couldn't save. Check the connection, then try again."; // G11  (line 37)

### `src/lib/star/eventsText.js`
- export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";  (line 99)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 100)
- export const registrationNotClosed = (name) => `Registration for ${name} wasn't closed. Check the connection and try again.`;  (line 105)
- export const registrationNotOpened = (name) => `Registration for ${name} wasn't opened. Check the connection and try again.`;  (line 106)
- export const eventNotDeleted = (name) => `${name} wasn't deleted. Check the connection and try again.`;  (line 108)

### `src/lib/star/gradingText.js`
- return `Couldn’t save ${gradesAndCounts(grades, counts)}${who}. Check the connection, then try again.`;  (line 73)
- export const CHOOSE_FAILED = 'Couldn’t save. Check the connection, then try again.';  (line 131)

### `src/lib/star/resultsText.js`
- export const addressFailed = (name) => `Couldn’t get ${name}’s email address. Check the connection, then try again.`; // + Retry  (line 98)
- export const MESSAGE_NOT_READY = 'Couldn’t build the message. Check the connection, then try again.';  (line 100)
- default: return `Couldn’t mark ${name} as sent. Check the connection, then try again.`; // + Retry  (line 114)
- default: return 'Couldn’t undo Mark as sent. Check the connection, then try again.';  (line 124)
- export const CSV_FAILED = 'Couldn’t download the CSV. Check the connection, then try again.'; // + Retry  (line 139)
- export const LOAD_FAILED = 'Couldn’t load the results. Check the connection, then try again.'; // + Retry  (line 153)
- export const TEXT_SAVE_FAILED = 'Couldn’t save. Check the connection, then try again.'; // not in the mockups (the Star dialogs' line)  (line 167)

### `src/parts/M1.jsx`
- const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 20)

### `src/parts/M2.jsx`
- const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 25)

### `src/register/RegisterApp.jsx`
- // Too many page loads from this connection: say so (not "check your internet"), with Try again  (line 406)

### `src/register/StepCheck.jsx`
- hasTried, // a send failed before → the button says "Try again"  (line 36)

### `src/register/text.js`
- export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';  (line 81)
- export const VERIFY_FAILED = 'We couldn’t check this browser. Try again, or ask at the front desk.';  (line 82)
- export const LOAD_FAILED_TEXT = 'Check your internet connection and try again.';  (line 114)

### `src/screens/ChangePasswordDialog.jsx`
- connection: "Couldn't reach the server. Check the connection and try again.",  (line 39)
- failed: "Couldn't change your password. Try again.",  (line 40)

### `src/screens/ChangePinDialog.jsx`
- connection: "Couldn't reach the server. Check the connection and try again.",  (line 30)
- const SAVE_ERROR = "Couldn't save your PIN. Check the connection and try again.";  (line 35)

### `src/screens/LockScreen.jsx`
- const CONNECTION_ERROR = "Couldn't check your PIN. Check the connection and try again.";  (line 35)

### `src/screens/SetPinScreen.jsx`
- const SAVE_ERROR = "Couldn't save your PIN. Check the connection and try again.";  (line 27)

### `src/screens/SignIn.jsx`
- connection: "Couldn't reach the server. Check the connection and try again.",  (line 19)

### `src/screens/calendar/text.js`
- export const SAVE_FAILED = "Couldn't save. Check the connection and try again.";  (line 283)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again."; // the dashboard's words (pass 2 U-08)  (line 284)
- export const LOAD_FAILED = "Couldn't load the calendar. Check the connection and try again.";  (line 297)
- export const UNDO_FAILED = "Couldn't undo. Check the connection and try again.";  (line 299)

### `src/screens/camps/text.js`
- export const checkInFailed = (name) => `${name} wasn't checked in. Check the connection and try again.`; // (not in the mockups)  (line 574)
- export const undoCheckInFailed = (name) => `${name}'s check-in wasn't undone. Check the connection and try again.`; // (not in the mockups)  (line 575)
- export const UNDO_PAYMENT_FAILED = "Couldn't undo. Check the connection, then try again.";  (line 635)

### `src/screens/forms/text.js`
- export const LOAD_FAILED = "Couldn't load the forms. Check the connection and try again.";  (line 15)
- export const COPY_REFUSED = "This form couldn't be copied. Open it and check its questions, then try again.";  (line 69)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 79)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 91)
- export const SAVE_FAILED_BAR = "Your last change wasn't saved. Check the connection — it will try again with your next change.";  (line 135)
- export const KIOSK_FAILED = "Couldn't open kiosk mode. Check the connection, then try again.";  (line 271)
- export const KIOSK_END_FAILED = "Couldn't end kiosk mode. Check the connection, then try again.";  (line 281)

### `src/screens/prospects/text.js`
- export const LOAD_FAILED = "Couldn't load the prospects. Check the connection and try again.";  (line 19)
- export const PRINT_FAILED = "Couldn't get the pages ready to print. Check the connection and try again.";  (line 214)
- export const SIGNATURE_FAILED = "Couldn't load the signature. Check the connection and try again.";  (line 245)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again."; // Black Belt's and the Schedule's words (R2-01)  (line 349)
- export const LOAD_ONE_FAILED = "Couldn't load that child. Check the connection, then try again."; // reading a card's child before a Board drop's box  (line 351)
- export const TIMES_FAILED = "Couldn't load the times. Check the connection, then try again."; // Book a free class' list of times  (line 352)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 356)
- export const BOX_SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 357)

### `src/screens/schedule/text.js`
- export const AGES_FAILED = "The time slot saved, but the ages didn't. Check the connection, then try again.";  (line 79)
- export const COLOR_AND_AGES_FAILED = "The time slot saved, but the color and the ages didn't. Check the connection, then try again.";  (line 80)
- export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";  (line 164)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 165)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 166)
- export const COLOR_FAILED = "The time slot saved, but the color didn't. Check the connection, then try again.";  (line 168)

### `src/screens/settings/text.js`
- export const INVALID = "That didn't save. Check the fields and try again.";  (line 73)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 74)

### `src/screens/staff/text.js`
- connection: "Couldn't reach the server. Check the connection and try again.",  (line 41)
- export const PASSWORD_FAILED = "Couldn't reset the password. Nothing was changed. Try again.";  (line 63)
- export const PIN_FAILED = "Couldn't reset the PIN. Nothing was changed. Try again.";  (line 71)

### `src/screens/testing/star/candidates/text.js`
- export const UNDO_BOX_FAILED = "Couldn't undo. Check the connection, then try again."; // Undo payment, Undo refund (Q2 B)  (line 164)
- export const DELETE_BOX_FAILED = "Couldn't delete. Check the connection, then try again."; // Delete permanently (Q2 B)  (line 165)

### `src/screens/testing/star/grading/MakeupChoiceDialog.jsx`
- // no_access lock the screen; error "Couldn't save. Check the connection, then try again."  (line 25)

### `src/screens/testing/star/grading/text.js`
- export const LOAD_PRIVATE_FAILED = 'Couldn’t load the private testing. Check the connection, then try again.'; // approved v0.513 (Color Belt's patter  (line 88)
- export const LOAD_GRADES_FAILED = 'Couldn’t load the grades. Check the connection, then try again.'; // approved v0.513 (Color Belt's pattern; not in   (line 102)

### `src/screens/testing/star/text.js`
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 71)
- export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";  (line 237)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 238)

### `src/screens/testing/text.js`
- export const INVALID_DIALOG = "That didn't save. Check the fields and try again.";  (line 284)
- export const SAVE_FAILED = "Couldn't save. Check the connection, then try again.";  (line 285)
- export const DELETE_FAILED = "Couldn't delete. Check the connection, then try again.";  (line 286)
- export const registrationNotClosed = (name) => `Registration for ${name} wasn't closed. Check the connection and try again.`;  (line 453)
- export const registrationNotOpened = (name) => `Registration for ${name} wasn't opened. Check the connection and try again.`;  (line 454)
- // "Couldn’t save 2 results (Group A). Check the connection, then try again."  (line 925)
- return `Couldn’t save ${what}${where}. Check the connection, then try again.`;  (line 929)
- export const NOTE_SAVE_FAILED = 'Couldn’t save the note. Check the connection, then try again.';  (line 949)
- export const CB_CSV_FAILED = 'Couldn’t download the CSV. Check the connection, then try again.'; // + Retry  (line 977)

### `src/star-register/StepCheck.jsx`
- // 'failed' sending failed — amber banner at the top instead of the intro, button "Try again" (12)  (line 7)
- // 'verify' the human check couldn't run — amber box above Send with a "Try again" link (8)  (line 9)
- hasTried, // a send failed before → the button says "Try again"  (line 39)

### `src/star-register/text.js`
- export const SEND_FAILED = 'Your registration wasn’t sent. Check your internet connection and try again. Nothing you entered is lost.';  (line 101)
- export const VERIFY_BEFORE = 'We couldn’t check this browser. '; // screen 8: "… Try again, or ask at the front desk."  (line 102)
- export const LOAD_FAILED_TEXT = 'Check your internet connection and try again. If it keeps happening, please ask at the front desk.';  (line 139)
