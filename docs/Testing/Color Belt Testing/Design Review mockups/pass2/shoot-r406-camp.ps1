# shoot-r406-camp.ps1: pass 1's R4-06 Camps shots. Camps' family page loads Color Belt's register.css,
# so its total ("Total" on the check step, .reg-total b) changes too: today (600) and after (500), at 1280
# and 390. Fills the Thanksgiving Camp form (preview data, /camp/thx9kv3m) up to its check step.
# Run from the worktree root with the preview on 5191 and the screenshot browser on 9351.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$after = "(() => { const s=document.createElement('style'); s.textContent='.reg-fee__amount b, .reg-fwarn b, .reg-total b { font-weight: 500 !important; }'; document.head.append(s); return 'after'; })()"
$sizes = @(@('1280', '800', '', 'pc'), @('390', '844', 'touch', 'w390'))
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  node $c open 'http://localhost:5191/camp/thx9kv3m' | Out-Null
  Start-Sleep 3
  node $c type '#camp-c0-first' 'Ava' | Out-Null
  node $c type '#camp-c0-last' 'Thompson' | Out-Null
  node $c type '#camp-c0-age' '8' | Out-Null
  node $c clicksel '#camp-c0-member' | Out-Null
  node $c click 'Wed, Nov 25' | Out-Null
  node $c click 'Fri, Nov 27' | Out-Null
  node $c type '#camp-parent-name' 'Dana Thompson' | Out-Null
  node $c type '#camp-parent-phone' '5085550123' | Out-Null
  node $c type '#camp-parent-relation' 'Mother' | Out-Null
  node $c type '#camp-emergency-name' 'Sam Thompson' | Out-Null
  node $c type '#camp-emergency-phone' '5085550199' | Out-Null
  node $c type '#camp-emergency-relation' 'Uncle' | Out-Null
  node $c clicksel '#camp-paying' | Out-Null
  node $c click 'Continue' | Out-Null
  Start-Sleep 2
  $found = node $c eval "!!document.querySelector('.reg-total b')"
  if ($found -ne 'true') { Write-Output ('no total yet: ' + (node $c eval "document.body.innerText.slice(0,600)")); continue }
  node $c eval "(() => { document.querySelector('.reg-total').scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/r406-$($s[3])-camp-today.png" | Out-Null
  node $c rects '.reg-total b'
  node $c eval $after | Out-Null
  node $c shot "$d/r406-$($s[3])-camp-after.png" | Out-Null
  Write-Output "shot $($s[3]) camp"
}
node $c size 1280 800 | Out-Null
