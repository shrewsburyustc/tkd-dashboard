# shoot-m02.ps1: pass 2 M-02's shots. Ava Chen's private testing History after a Mark paid by another
# way (card instead of her cash) and its Undo payment: today (each save shows as two entries) and after
# (one entry per save, money first), at the four review sizes. Run from the worktree root with the
# preview on 5191 and the screenshot browser on 9351, signed in as admin, AFTER the Mark paid and the
# Undo payment were done in the preview (see the M-02 notes in the plan), on the Private testing tab.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-m02.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$open = "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Ava Chen')); r.click(); return 'opened'; })()"
$show = "(() => { document.querySelector('.hist-btn').scrollIntoView({ block: 'start' }); return 'scrolled'; })()"
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  # a reload opens Color belt testing on its Events tab again
  node $c click 'Private testing' | Out-Null
  node $c wait 'Ava Chen' 6000 | Out-Null
  node $c eval $open | Out-Null
  Start-Sleep 1
  node $c clicksel '.hist-btn' | Out-Null
  Start-Sleep 2
  node $c eval $show | Out-Null
  node $c shot "$d/m02-$($s[3])-undo-today.png" | Out-Null
  node $c rects '.hist-list' '.hist-btn'
  node $c eval $inject
  node $c shot "$d/m02-$($s[3])-undo-after.png" | Out-Null
  node $c rects '.hist-list' '.hist-btn'
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
