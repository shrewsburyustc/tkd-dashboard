# shoot-r3.ps1: pass 1's R3-10 + R3-02 shots. The area above the event roster with a possible-duplicate
# pair (Mia Lopez, Group A): today (cards first, the duplicate counted in Not paid) and after (the box
# first; the possible duplicate out of Paid / Not paid; the gray line), at the four review sizes. Run
# from the worktree root with the preview on 5191 and the screenshot browser on 9351, signed in as admin,
# with the preview's test data as reset (November Children Testing: Students 15 · Paid 6 · Not paid 9).
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-r3.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '900', 'touch', 'w320'))
# $args[0] = 'w320' re-shoots only 320. 320 is shot 900 tall: at 640 the area sits under the bottom bar, and a scrolled
# shot draws the fixed bottom bar in the wrong place (a screenshot-tool quirk). The review size is just "320 wide".
if ($args[0] -eq 'w320') { $sizes = $sizes[3..3] }
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  Pin
  node $c eval "location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  node $c wait 'possible duplicate' 6000 | Out-Null
  node $c eval 'window.scrollTo(0,0)' | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/r3-$($s[3])-today.png" | Out-Null
  node $c rects '.ev-cards' '.ev-dupbox' '.ev-class-switch'
  node $c eval "window.__r3 = { notPaid: 8, flagged: 1 }; 'ok'" | Out-Null
  node $c eval $inject
  node $c shot "$d/r3-$($s[3])-after.png" | Out-Null
  node $c rects '.ev-dupbox' '.ev-cards' '.cards-note' '.ev-class-switch'
  node $c reload | Out-Null
  Start-Sleep 2
  Pin
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
