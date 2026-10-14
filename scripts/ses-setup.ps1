<#
.SYNOPSIS
    AWS SES (Simple Email Service) setup script for TBI Employee Management Platform.

.DESCRIPTION
    Automates SES domain identity creation, Easy DKIM configuration, IAM restricted
    user creation, and SigV4 SMTP password derivation without writing secrets to disk.

.PARAMETER Region
    AWS region for SES (Default: ap-south-1).
.PARAMETER Domain
    The domain to verify and configure with DKIM (e.g. tbi.org).
.PARAMETER FromAddress
    The sender email address restricted in the IAM policy (e.g. noreply@tbi.org).
.PARAMETER SmtpUserName
    The IAM username to create for SMTP relay (Default: tbi-ses-smtp).
.PARAMETER RequestProductionAccess
    Optional switch to request SES production access (exit sandbox).
.PARAMETER WebsiteUrl
    Public URL of the application (required if RequestProductionAccess is set).
.PARAMETER UseCaseDescription
    Description of transactional email usage (required if RequestProductionAccess is set).

.EXAMPLE
    .\scripts\ses-setup.ps1 -Domain "tbi.org" -FromAddress "noreply@tbi.org" -Region "ap-south-1"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Region = "ap-south-1",

    [Parameter(Mandatory = $true)]
    [string]$Domain,

    [Parameter(Mandatory = $true)]
    [string]$FromAddress,

    [Parameter(Mandatory = $false)]
    [string]$SmtpUserName = "tbi-ses-smtp",

    [Parameter(Mandatory = $false)]
    [switch]$RequestProductionAccess,

    [Parameter(Mandatory = $false)]
    [string]$WebsiteUrl,

    [Parameter(Mandatory = $false)]
    [string]$UseCaseDescription
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-SecretKeyToSesSmtpPassword {
    <#
    .SYNOPSIS
        Derives the SES SMTP password from an AWS Secret Access Key using
        AWS's documented SigV4 algorithm: HMAC-SHA256("SendRawEmail", SecretKey)
        prepended with version byte 0x04, then base64 encoded.
    #>
    param (
        [Parameter(Mandatory = $true)]
        [string]$SecretAccessKey
    )

    $message = "SendRawEmail"
    $version = [byte]0x04

    $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($SecretAccessKey)
    $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($message)

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes
    $signatureBytes = $hmac.ComputeHash($messageBytes)

    # 33 bytes: 1 version byte + 32 signature bytes
    $rawBytes = New-Object byte[] 33
    $rawBytes[0] = $version
    [Array]::Copy($signatureBytes, 0, $rawBytes, 1, 32)

    return [Convert]::ToBase64String($rawBytes)
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " TBI Platform - AWS SES Setup & Identity Provisioning" -ForegroundColor Cyan
Write-Host " Region:        $Region" -ForegroundColor Cyan
Write-Host " Domain:        $Domain" -ForegroundColor Cyan
Write-Host " From Address:  $FromAddress" -ForegroundColor Cyan
Write-Host " IAM User:      $SmtpUserName" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ----------------------------------------------------------------------
# STEP 1: Verify AWS CLI installation and authenticated identity
# ----------------------------------------------------------------------
Write-Host "`n[Step 1/6] Verifying AWS CLI installation and credentials..." -ForegroundColor Yellow

$awsVersion = & aws --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "AWS CLI is not installed or not in PATH. Please install the AWS CLI v2 and run 'aws configure'."
}
Write-Host "AWS CLI detected: $awsVersion"

$callerIdentityJson = & aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to retrieve AWS caller identity. Ensure your AWS credentials are configured and valid."
}
$callerIdentity = $callerIdentityJson | ConvertFrom-Json
Write-Host "Authenticated as AWS Account: $($callerIdentity.Account) (ARN: $($callerIdentity.Arn))" -ForegroundColor Green

# ----------------------------------------------------------------------
# STEP 2: Configure SES Domain Identity with Easy DKIM
# ----------------------------------------------------------------------
Write-Host "`n[Step 2/6] Configuring SESv2 Email Domain Identity with Easy DKIM..." -ForegroundColor Yellow

$identityExists = $false
try {
    $existingIdentityJson = & aws sesv2 get-email-identity --email-identity $Domain --region $Region --output json 2>$null
    if ($LASTEXITCODE -eq 0) {
        $identityExists = $true
        $identityData = $existingIdentityJson | ConvertFrom-Json
        Write-Host "Domain identity '$Domain' already exists in SES ($Region)." -ForegroundColor Green
    }
} catch {
    $identityExists = $false
}

if (-not $identityExists) {
    Write-Host "Creating new SESv2 domain identity for '$Domain'..."
    & aws sesv2 create-email-identity `
        --email-identity $Domain `
        --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT `
        --region $Region `
        --output json | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create email identity for '$Domain'."
    }
    Start-Sleep -Seconds 2
    $identityData = (& aws sesv2 get-email-identity --email-identity $Domain --region $Region --output json) | ConvertFrom-Json
}

# Display Easy DKIM DNS records
$tokens = $identityData.DkimAttributes.Tokens
if ($tokens -and $tokens.Count -gt 0) {
    Write-Host "`n------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host " ACTION REQUIRED: Add these 3 CNAME records at your DNS host:" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    foreach ($token in $tokens) {
        $recordName = "${token}._domainkey.${Domain}"
        $recordValue = "${token}.dkim.amazonses.com"
        Write-Host "Type:  CNAME" -ForegroundColor White
        Write-Host "Name:  $recordName" -ForegroundColor Yellow
        Write-Host "Value: $recordValue`n" -ForegroundColor Yellow
    }
    Write-Host "Also recommend adding SPF TXT record for $Domain:" -ForegroundColor Cyan
    Write-Host "Type:  TXT" -ForegroundColor White
    Write-Host "Name:  @" -ForegroundColor Yellow
    Write-Host "Value: v=spf1 include:amazonses.com ~all`n" -ForegroundColor Yellow
} else {
    Write-Host "Warning: No DKIM tokens returned. Inspect identity attributes in AWS console." -ForegroundColor Red
}

# Check verification status
$dkimStatus = $identityData.DkimAttributes.Status
Write-Host "Current DKIM Verification Status: $dkimStatus" -ForegroundColor ($dkimStatus -eq "SUCCESS" ? "Green" : "Yellow")

if ($dkimStatus -ne "SUCCESS") {
    Write-Host "Polling for DKIM verification (press Ctrl+C to skip polling once DNS records are created)..."
    $maxAttempts = 10
    $attempt = 0
    while ($attempt -lt $maxAttempts -and $dkimStatus -ne "SUCCESS") {
        $attempt++
        Start-Sleep -Seconds 15
        $pollData = (& aws sesv2 get-email-identity --email-identity $Domain --region $Region --output json) | ConvertFrom-Json
        $dkimStatus = $pollData.DkimAttributes.Status
        Write-Host "Attempt $attempt/$maxAttempts - DKIM Status: $dkimStatus" -ForegroundColor ($dkimStatus -eq "SUCCESS" ? "Green" : "Yellow")
    }
}

# ----------------------------------------------------------------------
# STEP 3: Check SES Account Sandbox Status
# ----------------------------------------------------------------------
Write-Host "`n[Step 3/6] Checking SES account sandbox status..." -ForegroundColor Yellow

$accountInfo = (& aws sesv2 get-account --region $Region --output json) | ConvertFrom-Json
$isProduction = $accountInfo.ProductionAccessEnabled

if ($isProduction) {
    Write-Host "SES Account Status: PRODUCTION ACCESS ENABLED" -ForegroundColor Green
    Write-Host "The account can send emails to any recipient." -ForegroundColor Green
} else {
    Write-Host "SES Account Status: SANDBOX" -ForegroundColor Red
    Write-Host "NOTICE: In sandbox mode, emails can ONLY be sent to verified addresses or domains." -ForegroundColor Red
    Write-Host "To send to unverified recipients, request production access (see Step 6)." -ForegroundColor Yellow
}

# ----------------------------------------------------------------------
# STEP 4: Create Restricted IAM User with SendRawEmail Policy
# ----------------------------------------------------------------------
Write-Host "`n[Step 4/6] Creating dedicated IAM user '$SmtpUserName' with restricted policy..." -ForegroundColor Yellow

$userExists = $false
try {
    & aws iam get-user --user-name $SmtpUserName --output json 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $userExists = $true
        Write-Host "IAM user '$SmtpUserName' already exists." -ForegroundColor Green
    }
} catch {
    $userExists = $false
}

if (-not $userExists) {
    Write-Host "Creating IAM user '$SmtpUserName'..."
    & aws iam create-user --user-name $SmtpUserName --output json | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create IAM user '$SmtpUserName'."
    }
}

# Policy allowing ONLY ses:SendRawEmail restricted to $FromAddress
$policyDoc = @"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "ses:SendRawEmail",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "ses:FromAddress": "$FromAddress"
                }
            }
        }
    ]
}
"@

Write-Host "Attaching restricted inline policy 'SesSendRawEmailRestricted' to '$SmtpUserName'..."
$policyDocEscaped = $policyDoc.Replace("`r", "").Replace("`n", "")
& aws iam put-user-policy `
    --user-name $SmtpUserName `
    --policy-name "SesSendRawEmailRestricted" `
    --policy-document $policyDocEscaped `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to put user policy on '$SmtpUserName'."
}
Write-Host "Policy successfully attached. Restricted to FromAddress: $FromAddress" -ForegroundColor Green

# ----------------------------------------------------------------------
# STEP 5: Create IAM Access Key and Derive SES SMTP Password
# ----------------------------------------------------------------------
Write-Host "`n[Step 5/6] Generating access key and deriving SES SMTP password..." -ForegroundColor Yellow

$accessKeyJson = & aws iam create-access-key --user-name $SmtpUserName --output json
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create access key for '$SmtpUserName'."
}

$accessKeyData = $accessKeyJson | ConvertFrom-Json
$smtpUsername = $accessKeyData.AccessKey.AccessKeyId
$secretKey = $accessKeyData.AccessKey.SecretAccessKey

# Derive the SMTP password in memory using SigV4 HMAC-SHA256
$smtpPassword = Convert-SecretKeyToSesSmtpPassword -SecretAccessKey $secretKey

# Clear secretKey from memory variable
$secretKey = $null

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " SES SMTP CREDENTIALS (CONSOLE ONLY - DO NOT COMMIT)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "EMAIL_HOST:  email-smtp.$Region.amazonaws.com" -ForegroundColor White
Write-Host "EMAIL_PORT:  587" -ForegroundColor White
Write-Host "EMAIL_USER:  $smtpUsername" -ForegroundColor Yellow
Write-Host "EMAIL_PASS:  $smtpPassword" -ForegroundColor Yellow
Write-Host "EMAIL_FROM:  $FromAddress" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "SECURITY NOTICE: These credentials were NOT written to any file." -ForegroundColor Red
Write-Host "Copy them into your Vercel Project Environment Variables immediately." -ForegroundColor Red

# ----------------------------------------------------------------------
# STEP 6: Optional Production Access Request
# ----------------------------------------------------------------------
if ($RequestProductionAccess) {
    Write-Host "`n[Step 6/6] Requesting SES Production Access..." -ForegroundColor Yellow

    if (-not $WebsiteUrl -or -not $UseCaseDescription) {
        Write-Warning "WebsiteUrl and UseCaseDescription are required to request production access."
        Write-Warning "Skipping automated request. Submit via AWS Console -> SES -> Account dashboard."
    } else {
        Write-Host "Submitting production access request to AWS SES..."
        & aws sesv2 put-account-details `
            --mail-type "TRANSACTIONAL" `
            --website-url $WebsiteUrl `
            --use-case-description $UseCaseDescription `
            --region $Region `
            --output json

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Production access request submitted successfully." -ForegroundColor Green
        } else {
            Write-Warning "Unable to submit production access request automatically. Check AWS Console."
        }
    }
} else {
    Write-Host "`n[Step 6/6] Production access request skipped (-RequestProductionAccess switch not used)." -ForegroundColor Gray
}

Write-Host "`nSES Setup Completed successfully." -ForegroundColor Green
