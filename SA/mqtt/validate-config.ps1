param(
    [string]$ConfigPath = ".\mosquitto.conf",
    [string]$SecureConfigPath = ".\mosquitto.secure.example.conf",
    [string]$AclPath = ".\acl.example"
)

$ErrorActionPreference = "Stop"

function Assert-FileExists {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Manjka datoteka: $Path"
    }
}

function Assert-Contains {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Message
    )

    if ($Content -notmatch $Pattern) {
        throw $Message
    }
}

Assert-FileExists $ConfigPath
Assert-FileExists $SecureConfigPath
Assert-FileExists $AclPath

$config = Get-Content -LiteralPath $ConfigPath -Raw
$secureConfig = Get-Content -LiteralPath $SecureConfigPath -Raw
$acl = Get-Content -LiteralPath $AclPath -Raw

Assert-Contains $config "(?m)^listener\s+1883\s+" "Razvojni config mora imeti MQTT listener na 1883."
Assert-Contains $config "(?m)^listener\s+9001\s+" "Razvojni config mora imeti WebSocket listener na 9001."
Assert-Contains $config "(?m)^allow_anonymous\s+true\s*$" "Razvojni config mora dovoliti anonimni dostop za lokalno testiranje."
Assert-Contains $config "(?m)^persistence\s+true\s*$" "Razvojni config mora imeti vklopljeno persistenco."
Assert-Contains $config "(?m)^log_dest\s+stdout\s*$" "Razvojni config mora logirati na stdout."

Assert-Contains $secureConfig "(?m)^allow_anonymous\s+false\s*$" "Varnostni template mora prepovedati anonimni dostop."
Assert-Contains $secureConfig "(?m)^password_file\s+/mosquitto/config/passwd\s*$" "Varnostni template mora kazati na password_file."
Assert-Contains $secureConfig "(?m)^acl_file\s+/mosquitto/config/acl\s*$" "Varnostni template mora kazati na acl_file."

Assert-Contains $acl "user\s+npo-publisher" "ACL primer mora vsebovati NPO publisher uporabnika."
Assert-Contains $acl "user\s+rai-consumer" "ACL primer mora vsebovati RAI consumer uporabnika."
Assert-Contains $acl 'topic\s+read\s+\$SYS/#' "ACL primer mora dovoliti monitoring branje SYS topicov."

Write-Host "Mosquitto konfiguracija je skladna s SCRUM-36 osnovnimi preverjanji."
