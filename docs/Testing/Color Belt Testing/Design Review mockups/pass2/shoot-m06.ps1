# shoot-m06.ps1 — pass 2 M-06's shots: the Grading tab today and after (Print results gone), as admin
# and as staff, at the four review sizes. Run from the worktree root with the preview on port 5191,
# the screenshot browser launched (TKD_CDP_PORT 9351), signed in and on the event's Grading tab.
# The role comes from $args[0] ('admin' or 'staff'); switch it in the page first (setRole + reload + PIN).
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$role = $args[0]
# comment lines dropped: Windows PowerShell 5.1 mangles double quotes in arguments to node
$inject = (Get-Content "$d/inject-m06.js" | Where-Object { $_ -notmatch '^\s*//' }) -join ' '
$sizes = @(@('1280', '800', '', 'pc'), @('820', '1180', 'touch', 'w820'), @('390', '844', 'touch', 'w390'), @('320', '640', 'touch', 'w320'))
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  Start-Sleep 2
  # a touch change reloads the page, which brings the PIN screen back
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  node $c wait 'Print grading sheet' 6000 | Out-Null
  node $c eval 'window.scrollTo(0,0)' | Out-Null
  node $c shot "$d/m06-$($s[3])-$role-today.png" | Out-Null
  node $c eval $inject
  node $c shot "$d/m06-$($s[3])-$role-after.png" | Out-Null
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  Write-Output "shot $($s[3]) $role"
}
node $c size 1280 800 | Out-Null
