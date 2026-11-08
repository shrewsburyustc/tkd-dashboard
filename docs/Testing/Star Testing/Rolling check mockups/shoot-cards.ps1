# shoot-cards.ps1 â€” takes the preview screenshots for Star's Step B pictures B3 (count cards) and B4
# (Print receipt on a withdrawn row), at 4 sizes, "Today" (the real page) and "After" (the real page with
# mock-cards.js drawn over it), and writes the outline boxes to shots/d-marks.json.
# Why a script: 2 pictures x 4 sizes x Today/After x several scenes is a lot of clicking; a script makes
# a re-shoot one command. Needs the preview app (fake database) running at http://localhost:5174 with
# Chrome started by:  $env:TKD_CDP_PORT='9829'; node "../../../Design Review/tools/cdp.mjs" launch
# and signed in as admin, with Noah Chen (paid) and two unpaid candidates withdrawn (Owen Hart, and one more).
# Never run against the live site. Usage:  powershell -File shoot-cards.ps1 B3   (or B4)
param([string]$Part = 'B3')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cdp = Join-Path $here '..\..\..\Design Review\tools\cdp.mjs'
$shots = Join-Path $here 'shots'
$mock = Get-Content -Raw -Encoding UTF8 (Join-Path $here 'mock-cards.js')
$env:TKD_CDP_PORT = '9829'
$marksFile = Join-Path $shots 'd-marks.json'
$marks = @{}
if (Test-Path $marksFile) { (Get-Content -Raw $marksFile | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $marks[$_.Name] = $_.Value } }

function Ev([string]$js) {
  $b = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
  node $cdp eval "eval(decodeURIComponent(escape(atob('$b'))))"
}
function Mock([string]$mode, [string]$params = '{}') { Ev ("window.__mockB='$mode'; window.__mockP=$params; " + $mock) }
function Rects([string]$sel) {
  $r = Ev ("window.__mockB='rects'; window.__mockSel=" + (ConvertTo-Json $sel) + "; " + $mock)
  if ($r) { return ($r | ConvertFrom-Json) } else { return @() }
}
function Shot([string]$name, [bool]$full) {
  node $cdp move 5 5 | Out-Null
  if ($full) { node $cdp shot (Join-Path $shots "d-$name.png") full | Out-Null } else { node $cdp shot (Join-Path $shots "d-$name.png") | Out-Null }
}
function ClickText([string]$sel, [string]$pattern) {
  Ev ("[...document.querySelectorAll('$sel')].find(b=>/$pattern/.test(b.textContent.trim()))?.click(); 1") | Out-Null
}
# Fresh page, then: school (Worcester is what a reload gives), Dan, and an optional count card (1 = Paid, 2 = Not paid).
function Setup([string]$school, [string]$dan, [int]$card) {
  node $cdp reload | Out-Null
  Start-Sleep -Seconds 2
  if ($school -eq 'Both') { ClickText 'button' '^Both$'; Start-Sleep -Milliseconds 700 }
  if ($dan) { ClickText 'button' "^$dan"; Start-Sleep -Milliseconds 400 }
  if ($card -gt 0) { Ev "document.querySelectorAll('button.ev-card--button')[$card].click(); 1" | Out-Null; Start-Sleep -Milliseconds 500 }
  Ev "window.scrollTo(0,0); 1" | Out-Null
}
$sizes = @(
  @{ k = 'pc'; w = 1280; h = 800; t = '' },
  @{ k = 'tab'; w = 820; h = 1180; t = 'touch' },
  @{ k = 'ph'; w = 390; h = 1250; t = 'touch' },
  @{ k = 'p320'; w = 320; h = 1250; t = 'touch' }
)
function SetSize($s) {
  if ($s.t) { node $cdp size $s.w $s.h touch | Out-Null } else { node $cdp size $s.w $s.h | Out-Null }
  Start-Sleep -Seconds 2
}
function Save() { $marks | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $marksFile }

if ($Part -eq 'B3') {
  $ap = [string][char]0x2019   # the app writes curly apostrophes (this file stays plain ASCII so PowerShell 5.1 reads it right)
  $DUP = "1 possible duplicate isn${ap}t counted in Paid or Not paid until it${ap}s reviewed."
  $scenes = @(
    @{ n = 'B3m'; school = 'Both'; dan = '1st Dan'; card = 0; after = "{schools:['Worcester 6','Shrewsbury 5'],notPaid:2,payments:'`$930',payNote:'includes `$140 from removed candidates',dupLine:`"$DUP`",dupRows:'noMarkPaid'}" },
    @{ n = 'B3f'; school = 'Both'; dan = '1st Dan'; card = 2; after = "{schools:['Worcester 6','Shrewsbury 5'],notPaid:2,payments:'`$930',payNote:'includes `$140 from removed candidates',dupLine:`"$DUP`",dupRows:'hide'}" },
    @{ n = 'B3p'; school = 'Worcester'; dan = '1st Dan'; card = 1; after = "{notPaid:2,payments:'`$140',payNote:'includes `$140 from removed candidates',dupLine:`"$DUP`",text:'No paid candidates in this Dan.'}" },
    @{ n = 'B3n'; school = 'Both'; dan = '2nd Dan'; card = 2; after = "{schools:['Worcester 6','Shrewsbury 5'],notPaid:2,payments:'`$930',payNote:'includes `$140 from removed candidates',dupLine:`"$DUP`",dupRows:'noMarkPaid',text:'Every candidate in this Dan has paid.'}" }
  )
  foreach ($s in $sizes) {
    SetSize $s
    foreach ($sc in $scenes) {
      Setup $sc.school $sc.dan $sc.card
      Shot "$($sc.n)-today-$($s.k)" $true
      $marks["$($sc.n)-today-$($s.k)"] = @{ cards = (Rects '.ev-cards .ev-card'); empty = (Rects '.tempty'); showing = (Rects '.cards-showing'); markPaid = (Rects 'button[aria-label^="Mark paid for Ava Reed"]') }
      Mock 'cards' $sc.after | Out-Null
      if ($sc.after -match 'text:') { Mock 'empty' $sc.after | Out-Null }
      Start-Sleep -Milliseconds 300
      Shot "$($sc.n)-after-$($s.k)" $true
      $marks["$($sc.n)-after-$($s.k)"] = @{ cards = (Rects '.ev-cards .ev-card'); note = (Rects '.cards-note'); avaRows = (Rects '.st-crow-c[aria-label="Ava Reed"]'); empty = (Rects '.tempty'); showing = (Rects '.cards-showing') }
      Save
    }
  }
}


function Reveal() {
  Ev "const t=document.querySelector('.ev-removed-toggle'); if(t.getAttribute('aria-expanded')!=='true') t.click(); t.style.scrollMarginTop='110px'; setTimeout(()=>t.scrollIntoView({block:'start'}),60); 1" | Out-Null
  Start-Sleep -Milliseconds 700
}
function OpenMenu([string]$name) {
  Ev ("document.querySelector('button[aria-label=" + '"More actions for ' + $name + '"' + "]').click(); 1") | Out-Null
  Start-Sleep -Milliseconds 500
}
function SetRole([string]$role) {
  Ev "window.__tkdPreview.setRole('$role'); 1" | Out-Null
}
$sizes4 = @(
  @{ k = 'pc'; w = 1280; h = 800; t = '' },
  @{ k = 'tab'; w = 820; h = 1180; t = 'touch' },
  @{ k = 'ph'; w = 390; h = 844; t = 'touch' },
  @{ k = 'p320'; w = 320; h = 700; t = 'touch' }
)
if ($Part -eq 'B4') {
  # Pass A: admin. The open menu of a withdrawn row with money (Noah Chen) Today / After, the staff-trimmed menu, and the no-money row.
  SetRole 'admin'; node $cdp reload | Out-Null; Start-Sleep -Seconds 2
  foreach ($s in $sizes4) {
    SetSize $s
    Setup 'Both' '1st Dan' 0; Reveal; OpenMenu 'Noah Chen'
    Shot "B4a-today-$($s.k)" $false
    $marks["B4a-today-$($s.k)"] = @{ menu = (Rects '.tmenu, .tsheet'); row = (Rects '.st-crow-c[aria-label="Noah Chen"]') }
    Mock 'menuAdmin' | Out-Null; Start-Sleep -Milliseconds 300
    Shot "B4a-after-$($s.k)" $false
    $marks["B4a-after-$($s.k)"] = @{ menu = (Rects '.tmenu, .tsheet'); row = (Rects '.st-crow-c[aria-label="Noah Chen"]'); printItem = (Rects '[role=menu] > div:first-child > .tmenu-item') }
    Setup 'Both' '1st Dan' 0; Reveal; OpenMenu 'Noah Chen'
    Mock 'menuStaff' | Out-Null; Start-Sleep -Milliseconds 300
    Shot "B4c-after-$($s.k)" $false
    $marks["B4c-after-$($s.k)"] = @{ menu = (Rects '.tmenu, .tsheet'); row = (Rects '.st-crow-c[aria-label="Noah Chen"]') }
    Setup 'Both' '1st Dan' 0; Reveal; OpenMenu 'Owen Hart'
    Shot "B4d-same-$($s.k)" $false
    $marks["B4d-same-$($s.k)"] = @{ menu = (Rects '.tmenu, .tsheet'); row = (Rects '.st-crow-c[aria-label="Owen Hart"]') }
    Save
  }
  # Pass B: staff (view of the removed rows; no menu can be opened on them today).
  SetRole 'staff'; node $cdp reload | Out-Null; Start-Sleep -Seconds 2
  foreach ($s in $sizes4) {
    SetSize $s
    Setup 'Both' '1st Dan' 0; Reveal
    Shot "B4b-today-$($s.k)" $false
    $marks["B4b-today-$($s.k)"] = @{ rows = (Rects '.st-crow-c.is-removed'); more = (Rects '.st-crow-c.is-removed .ev-more-spacer') }
    Mock 'dots' '{names:["Noah Chen"]}' | Out-Null; Start-Sleep -Milliseconds 300
    Shot "B4b-after-$($s.k)" $false
    $marks["B4b-after-$($s.k)"] = @{ rows = (Rects '.st-crow-c.is-removed'); noah = (Rects '.st-crow-c[aria-label="Noah Chen"] button[aria-label^="More actions"]') }
    Save
  }
  SetRole 'admin'; node $cdp reload | Out-Null
}
