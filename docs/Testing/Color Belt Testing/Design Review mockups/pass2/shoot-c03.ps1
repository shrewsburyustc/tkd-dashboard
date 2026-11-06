# shoot-c03.ps1: pass 2 C-03's shots. Ava Chen's private testing summary after a $65 cash payment
# (moved with her from the event) and a $20 card top-up, today (one made-up "$85 card" payment) and
# after (one line per payment), at the four review sizes. Run from the worktree root with the preview
# on 5191 and the screenshot browser on 9351, signed in as admin, after Ava's $20 card payment, on
# Color belt testing's Private testing tab.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-c03.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$open = "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Ava Chen')); r.click(); return 'opened'; })()"
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
# $args[0] = 'small' re-shoots only the three smaller sizes
if ($args[0] -eq 'small') { $sizes = $sizes[1..3] }
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  # a reload opens Color belt testing on its Events tab again
  node $c click 'Private testing' | Out-Null
  node $c wait 'Ava Chen' 6000 | Out-Null
  node $c eval $open | Out-Null
  Start-Sleep 2
  node $c shot "$d/c03-$($s[3])-today.png" | Out-Null
  node $c eval $inject
  node $c shot "$d/c03-$($s[3])-after.png" | Out-Null
  node $c textrects 'Payment' '$20 card'
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Write-Output "shot $($s[3])"
}
node $c size 1280 800 | Out-Null
