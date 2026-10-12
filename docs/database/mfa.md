# Privileged user MFA storage

```mermaid
erDiagram
  USER ||--o| MFA : embeds
  MFA {
    string secret "AES-256-GCM ciphertext; key kept outside MongoDB"
    string version "Random enrollment identifier"
    number lastStep "Last accepted TOTP time step, initially -1"
    number attempts "Attempts in current five-minute window"
    date windowStartedAt
  }
```

`User.mfa` is optional for existing users and excluded from queries by default.
Privileged accounts without this subdocument cannot log in. Only authentication
repository queries explicitly select it. Enrollment is performed by a trusted
operator; profile and account creation endpoints cannot write MFA fields.
