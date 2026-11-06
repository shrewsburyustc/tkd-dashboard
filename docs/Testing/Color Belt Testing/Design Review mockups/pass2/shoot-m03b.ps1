# shoot-m03b.ps1: the M-03 follow-up question's shots. Ava Chen's CANCELLED private testing ($65 of $85
# paid): her receipt today and with options A and B, and her summary today and after, at the four
# review sizes (A, the recommendation, at all four; today and B at 1280 and 390). Run from the worktree
# root with the preview on 5191 and the screenshot browser on 9351, signed in as admin, AFTER Ava's
# private testing was cancelled in the preview.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-m03b.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
function Open-Past {
  node $c eval "location.hash='#testing/color-belt'; 'ok'" | Out-Null
  Start-Sleep 1
  node $c click 'Private testing' | Out-Null
  Start-Sleep 1
  node $c click 'Past 3' | Out-Null
  node $c wait 'Ava Chen' 6000 | Out-Null
}
function Open-Receipt {
  node $c clicksel 'h1' | Out-Null
  node $c click 'More actions for Ava Chen' | Out-Null
  Start-Sleep 1
  node $c click 'Print receipt' | Out-Null
  Start-Sleep 2
  node $c move 5 5 | Out-Null
}
function Close-Dialogs { node $c key Escape | Out-Null; Start-Sleep 1 }
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  Pin
  Open-Past
  $all = ($s[3] -eq 'pc' -or $s[3] -eq 'w390')
  Open-Receipt
  if ($all) { node $c shot "$d/m03b-$($s[3])-receipt-today.png" | Out-Null }
  node $c eval "window.__m03b='A'; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/m03b-$($s[3])-receipt-A.png" | Out-Null
  node $c rects '.rcpt-sheet' '.rcpt-totals' '.rcpt-facts'
  Close-Dialogs
  if ($all) {
    Open-Receipt
    node $c eval "window.__m03b='B'; 'ok'" | Out-Null
    node $c eval $inject
    node $c shot "$d/m03b-$($s[3])-receipt-B.png" | Out-Null
    Close-Dialogs
    # the summary: click the row
    node $c clicksel 'h1' | Out-Null
    node $c eval "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Ava Chen')); r.click(); return 'opened'; })()" | Out-Null
    Start-Sleep 1
    node $c move 5 5 | Out-Null
    node $c shot "$d/m03b-$($s[3])-summary-today.png" | Out-Null
    node $c eval "window.__m03b='summary'; 'ok'" | Out-Null
    node $c eval $inject
    node $c shot "$d/m03b-$($s[3])-summary-after.png" | Out-Null
    node $c textrects 'Payment'
    Close-Dialogs
  }
  node $c reload | Out-Null
  Start-Sleep 2
  Pin
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
