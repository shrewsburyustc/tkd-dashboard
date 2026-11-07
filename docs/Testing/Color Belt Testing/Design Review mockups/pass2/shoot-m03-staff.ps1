# shoot-m03-staff.ps1: pass 2 M-03's staff pictures as today (= option B): Owen Reed's removed row
# and Emma Ross's cancelled private testing have no ⋯ for staff. At 1280 and 390. Run from the
# worktree root with the preview on 5191 and the screenshot browser on 9351, AFTER Owen was withdrawn.
$env:TKD_CDP_PORT = '9351'
$c = 'docs/Design Review/tools/cdp.mjs'
$d = 'docs/Testing/Color Belt Testing/Design Review mockups/pass2'
$sizes = @(@('1280', '800', '', 'pc'), @('390', '844', 'touch', 'w390'))
node $c eval "__tkdPreview.setRole('staff'); 'ok'" | Out-Null
foreach ($s in $sizes) {
  if ($s[2]) { node $c size $s[0] $s[1] $s[2] | Out-Null } else { node $c size $s[0] $s[1] | Out-Null }
  node $c reload | Out-Null
  Start-Sleep 2
  if ((node $c eval "!!document.querySelector('.pin-input')") -eq 'true') { node $c type '.pin-input' '2580' | Out-Null; Start-Sleep 2 }
  node $c eval "location.hash='#testing/color-belt/event/000001e0-0000-4000-8000-000000000001'; 'ok'" | Out-Null
  node $c wait 'Owen Reed' 6000 | Out-Null
  node $c eval "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Owen Reed')); r.scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 300 | Out-Null
  node $c shot "$d/m03-$($s[3])-event-staffB.png" | Out-Null
  node $c textrects 'Owen Reed'
  node $c eval "location.hash='#testing/color-belt'; 'ok'" | Out-Null
  Start-Sleep 1
  node $c click 'Private testing' | Out-Null
  Start-Sleep 1
  node $c click 'Past 2' | Out-Null
  node $c wait 'Emma Ross' 6000 | Out-Null
  node $c eval "(() => { const r=[...document.querySelectorAll('[data-nav-row]')].find(x=>x.innerText.includes('Emma Ross')); r.scrollIntoView({ block: 'center' }); return 'ok'; })()" | Out-Null
  node $c move 5 300 | Out-Null
  node $c shot "$d/m03-$($s[3])-private-staffB.png" | Out-Null
  node $c textrects 'Emma Ross'
  Write-Output "shot $($s[3]) staff"
}
node $c eval "__tkdPreview.setRole('admin'); 'ok'" | Out-Null
node $c size 1280 800 | Out-Null
node $c reload | Out-Null
