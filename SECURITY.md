# Security policy

A stable release is not a security-certified product.
Only the latest stable application release and current release candidate receive fixes.

Do not publish projects, student records, bot tokens, API keys, or crash dumps in public issues.
Report vulnerabilities through GitHub private vulnerability reporting when enabled; otherwise
contact the repository owner privately before disclosing details. This file does not claim
that private reporting has been enabled on the GitHub repository.

The desktop application uses a sandboxed renderer, context isolation, local scripts, CSP,
top-frame IPC validation, limited file capabilities and denied device permissions. Roles in
the UI are views, not authenticated accounts. File backups contain the same confidential data
as the project and must be protected accordingly. The local OS account remains the trust boundary.

Telegram exports public group schedules only. AI generation is optional and sends planning
data to the selected external provider; institutions must authorize that transfer themselves.

Run `npm audit`, `npm run test:security`, the full test suite and packaged checks before releases.
No vulnerability suppression list is used. A zero audit result does not prove absence of flaws.
Code signing requires an actual publisher certificate; no self-signed certificate is presented
as a trusted signature. CI can use WINDOWS_CSC_LINK and WINDOWS_CSC_KEY_PASSWORD secrets.
