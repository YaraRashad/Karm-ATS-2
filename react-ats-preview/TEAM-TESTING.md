# Karm ATS Preview Testing

## Live Local Test Link

If you are on the same Wi-Fi/network as this Mac, open:

http://172.20.10.2:5173/

If you are testing on this Mac, open:

http://localhost:5173/

Keep the terminal running while people test.

## What To Test

- Switch roles from the bottom-left user area.
- Add a job requisition.
- Add a candidate and assign them to a job.
- Move candidates through the Pipeline.
- Schedule an interview and submit a scorecard.
- Approve an offer and check that the email notification preview appears.
- Export Jobs or Candidates to CSV.

## Reset Test Data

The app stores demo edits in the browser's local storage. To reset, open the browser dev tools and clear site data for the preview URL, or use the in-app reset option if visible in the version you are testing.

## Known Prototype Notes

- This preview is frontend-only. Each tester's browser keeps its own local data.
- AI CV/manpower parsing buttons are UI prototypes unless an Anthropic API proxy/key is connected.
- Email sending is simulated; the app shows/copies the email content instead of sending through Outlook automatically.
