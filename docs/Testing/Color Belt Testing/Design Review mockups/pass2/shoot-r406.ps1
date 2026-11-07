# shoot-r406.ps1: pass 1's R4-06 shots. The family pages' bold amounts in register.css go from weight
# 600 to 500 (rulebook v1.051 (4); §7 allows 400 and 500 on screen): Color Belt's fee amount and the
# bold start of its late-price warning (/register/<code>, after picking a class and belt), at 1280 and
# 390, today and after (the after drawn with a style override, mockup only).
# Run from the worktree root with the preview on 5191 and the screenshot browser on 9351.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$after = "(() => { const s=document.createElement('style'); s.textContent='.reg-fee__amount b, .reg-fwarn b, .reg-total b { font-weight: 500 !important; }'; document.head.append(s); return 'after'; })()"
$sizes = @(@('1280', '800', '', 'pc'), @('390', '844', 'touch', 'w390'))
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  node $c open 'http://localhost:5191/register/p4w9tdkm' | Out-Null
  Start-Sleep 3
  node $c click 'Group A' | Out-Null
  Start-Sleep 1
  node $c click 'Yellow' | Out-Null
  Start-Sleep 1
  node $c eval "(() => { document.querySelector('.reg-fee__amount').scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 5 | Out-Null
  node $c shot "$d/r406-$($s[3])-cb-today.png" | Out-Null
  node $c rects '.reg-fee__amount b' '.reg-fwarn b'
  node $c eval $after | Out-Null
  node $c shot "$d/r406-$($s[3])-cb-after.png" | Out-Null
  Write-Output "shot $($s[3]) color belt"
}
node $c size 1280 800 | Out-Null
