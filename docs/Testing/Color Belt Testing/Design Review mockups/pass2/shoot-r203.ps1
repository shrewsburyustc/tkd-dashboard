# shoot-r203.ps1: pass 1's R2-03 shots. Restoring a "Duplicate copy" (Mia Lopez, after Review → Keep
# this one: First registration) shows a toast; today it has Undo, after it doesn't (v1.043, Star's G3).
# At 1280 and 390. Run from the worktree root with the preview on 5191 and the screenshot browser on 9351,
# signed in as admin. The toast lasts 5 seconds, so each shot is taken right after Restore.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$sizes = @(@('1280', '800', '', 'pc'), @('390', '844', 'touch', 'w390'))
function Pin { if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 } }
$openCopyMenu = "(() => { const bs=[...document.querySelectorAll('[aria-label=\'More actions for Mia Lopez\']')]; bs[bs.length-1].click(); return bs.length; })()"
$dropUndo = "(() => { const t=[...document.querySelectorAll('.toast-text')].pop(); if (!t) return 'no toast'; let box=t.parentElement; while (box && !box.querySelector('button')) box=box.parentElement; const b=box && [...box.querySelectorAll('button')].find(x=>x.innerText.trim()==='Undo'); if (b) b.remove(); return b ? 'undo removed' : 'no undo button'; })()"
foreach ($s in $sizes) {
  node $c eval "__tkdPreview.resetTesting(); __tkdPreview.setRole('admin'); 'ok'" | Out-Null
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  node $c reload | Out-Null
  Start-Sleep 2
  Pin
  node $c eval "location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  node $c wait 'possible duplicate' 6000 | Out-Null
  node $c click 'Review' | Out-Null
  Start-Sleep 1
  node $c click 'Keep this one: First registration' | Out-Null
  # let the keep's own toast go before restoring
  Start-Sleep 6
  node $c click 'Group A' | Out-Null
  Start-Sleep 1
  node $c eval $openCopyMenu | Out-Null
  Start-Sleep 1
  node $c click 'Restore' | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/r2-03-$($s[3])-today.png" | Out-Null
  node $c eval $dropUndo
  node $c shot "$d/r2-03-$($s[3])-after.png" | Out-Null
  node $c rects '.toast-text'
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
node $c eval "__tkdPreview.resetTesting(); 'reset'" | Out-Null
