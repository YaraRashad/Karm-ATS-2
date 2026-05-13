# Publish Karm ATS Preview With GitHub Pages

Use this when the team is remote and needs a normal public link.

## Fastest Browser Method

1. Go to https://github.com/new
2. Create a new public repository, for example `karm-ats-preview`.
3. Open the new repo, then upload the files inside:
   `react-ats-preview/github-pages-upload`
4. Commit the uploaded files to the `main` branch.
5. Go to `Settings` -> `Pages`.
6. Under `Build and deployment`, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
7. Save.
8. Wait about 1 to 3 minutes.
9. Send the team the GitHub Pages URL, usually:
   `https://YOUR-GITHUB-USERNAME.github.io/karm-ats-preview/`

## Notes For Testers

- This is a frontend-only prototype.
- Each tester has their own browser-local test data.
- Email sending is simulated through an email preview/copy modal.
- AI file parsing is a UI prototype unless an API integration is connected.
