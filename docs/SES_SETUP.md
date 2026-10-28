# AWS Simple Email Service (SES) Setup Guide

This guide outlines the end-to-end setup of AWS Simple Email Service (SES) for the TBI Employee Management Platform. It covers automated provisioning using `scripts/ses-setup.ps1`, DNS record configuration, sandbox vs. production access, Vercel environment variables, and deliverability best practices.

---

## 1. Overview & Automated Setup Script

The provisioning script `scripts/ses-setup.ps1` automates:
1. **Pre-flight Checks**: Validates AWS CLI installation (`aws --version`) and caller credentials (`aws sts get-caller-identity`).
2. **Domain Identity & Easy DKIM**: Registers the domain identity with 2048-bit RSA Easy DKIM in SESv2, outputs the 3 CNAME DNS records, and polls until verification completes.
3. **Sandbox Detection**: Queries SES account status to determine whether production access is enabled.
4. **Least-Privilege IAM User**: Creates a dedicated IAM user (`tbi-ses-smtp`) with an inline policy restricted strictly to `ses:SendRawEmail` conditioned by `ses:FromAddress`.
5. **SigV4 SMTP Password Derivation**: Generates an access key and calculates the SES SMTP password in-memory using AWS's documented HMAC-SHA256 SigV4 algorithm. **Credentials are displayed on the console only and never persisted to disk.**
6. **Optional Production Request**: Optionally submits a transactional production access request via `aws sesv2 put-account-details`.

---

## 2. Prerequisites

1. **AWS CLI v2** installed and available in PATH.
2. **AWS Credentials Configured**: Run `aws configure` with an administrative IAM identity possessing permissions for `sesv2:*` and `iam:*`.
3. **DNS Access**: Administrative access to your domain's DNS provider (e.g. AWS Route 53, Cloudflare, Namecheap, GoDaddy).

---

## 3. Running the Setup Script

Execute `scripts/ses-setup.ps1` from a PowerShell prompt:

```powershell
.\scripts\ses-setup.ps1 -Domain "tbi.org" -FromAddress "noreply@tbi.org" -Region "ap-south-1"
```

### Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `-Domain` | String (Required) | — | Root or sub-domain to verify for email sending (e.g. `tbi.org`). |
| `-FromAddress` | String (Required) | — | Exact sender email to restrict in IAM policy (e.g. `noreply@tbi.org`). |
| `-Region` | String | `ap-south-1` | Target AWS Region where SES is configured. |
| `-SmtpUserName` | String | `tbi-ses-smtp` | Name of the dedicated IAM user created for SMTP relay. |
| `-RequestProductionAccess` | Switch | `false` | Submits an automated production access request. |
| `-WebsiteUrl` | String | — | Application URL (required if `-RequestProductionAccess` is set). |
| `-UseCaseDescription` | String | — | Description of transactional email usage (required for production request). |

---

## 4. DNS Configuration Step

Add the following records at your DNS host:

### 4.1. Easy DKIM (3 CNAME Records)
The script prints three distinct token-based CNAME records. Add all three:

| Type | Name / Host | Target / Value | TTL |
|---|---|---|---|
| `CNAME` | `<token1>._domainkey.tbi.org` | `<token1>.dkim.amazonses.com` | 300 / Auto |
| `CNAME` | `<token2>._domainkey.tbi.org` | `<token2>.dkim.amazonses.com` | 300 / Auto |
| `CNAME` | `<token3>._domainkey.tbi.org` | `<token3>.dkim.amazonses.com` | 300 / Auto |

### 4.2. SPF Record (TXT)
Authorize Amazon SES to send emails on behalf of your domain:

| Type | Name / Host | Target / Value | TTL |
|---|---|---|---|
| `TXT` | `@` (or `tbi.org`) | `v=spf1 include:amazonses.com ~all` | 300 / Auto |

### 4.3. DMARC Policy (Recommended TXT)
Ensure recipient mailboxes accept signed messages and report anomalies:

| Type | Name / Host | Target / Value | TTL |
|---|---|---|---|
| `TXT` | `_dmarc` (or `_dmarc.tbi.org`) | `v=DMARC1; p=none; rua=mailto:dmarc-reports@tbi.org` | 300 / Auto |

---

## 5. Sandbox vs. Production Access

All new AWS SES accounts start in the **SES Sandbox**:

- **Sandbox Limitations**:
  - Maximum 200 emails per 24-hour period.
  - Maximum sending rate: 1 email per second.
  - **Emails can ONLY be delivered to verified recipient email addresses or verified domains.** Sending to an unverified recipient will result in an immediate rejection (`MessageRejected: Email address is not verified`).

- **Moving to Production Access**:
  - In the AWS Console: Navigate to **Amazon SES -> Account dashboard -> Request production access**.
  - **Mail Type**: `TRANSACTIONAL`.
  - **Website URL**: Your deployed production URL (e.g. `https://your-domain.vercel.app`).
  - **Use Case**:
    > "TBI Employee Management Portal uses transactional emails exclusively for system notifications: new employee welcome credentials with temporary passwords, password change confirmations, and administrative alerts. All recipients are authenticated system users. Bounces and complaints are monitored via SNS."
  - AWS typically reviews and approves requests within 24 to 48 hours.

---

## 6. Environment Variables in Vercel

In your Vercel Project Settings (**Settings -> Environment Variables**), add the following variables for the Production environment:

| Variable | Example Value | Description |
|---|---|---|
| `EMAIL_HOST` | `email-smtp.ap-south-1.amazonaws.com` | SES SMTP endpoint matching your chosen AWS region. |
| `EMAIL_PORT` | `587` | Port 587 (enforces STARTTLS) or 465 (direct TLS). |
| `EMAIL_USER` | `AKIA_SES_SMTP_ACCESS_KEY` | IAM Access Key ID printed by `ses-setup.ps1`. |
| `EMAIL_PASS` | `BLa...derived...secret...` | Derived SigV4 SMTP password printed by `ses-setup.ps1`. |
| `EMAIL_FROM` | `TBI Platform <noreply@tbi.org>` | Sender address matching verified domain identity. |
| `USER_ID_PREFIX` | `TBI` | Prefix for sequential user ID generator (`TBI00001`). |

*Note: In `apps/web/server/services/email.service.js`, TLS is enforced on both port 587 (via STARTTLS) and port 465 (direct TLS).*

---

## 7. Verification & Test-Send Step

Once environment variables are deployed, verify delivery with a test email:

```bash
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: process.env.EMAIL_PORT === '465',
  requireTLS: process.env.EMAIL_PORT !== '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
transporter.sendMail({
  from: process.env.EMAIL_FROM,
  to: 'test-recipient@yourdomain.org',
  subject: 'TBI SES Integration Test',
  text: 'Amazon SES integration is working properly.'
}).then(info => console.log('Sent successfully:', info.messageId))
  .catch(err => console.error('Send failed:', err));
"
```

---

## 8. Bounce & Complaint Handling (Recommended)

To protect your domain reputation and ensure sender deliverability:

1. **Configuration Set**:
   - Create an SES Configuration Set named `tbi-transactional-set`.
   - In `ses-setup.ps1` or console, associate it with domain identity.
2. **SNS Topics**:
   - Create an Amazon SNS Topic `tbi-ses-bounces` and `tbi-ses-complaints`.
   - Route Event Publishing from the Configuration Set to the SNS topics.
3. **Reputation Monitoring**:
   - Keep complaint rate below **0.1%** and bounce rate below **5%** to prevent AWS account suspension.
