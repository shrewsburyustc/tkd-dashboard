// TemplatesTab.jsx — the "Templates" tab (C2): reusable camp setups, shared by both schools.
// Why it exists: most camps repeat. A template keeps a camp's school, hours, sign-up timing,
// prices, extras, ages, description and waiver; Use starts a new camp from it (Add camp with
// "Start from" already set — only the name and days are left to fill in).
//   - one row per template: name (exactly as typed when saved) · "5 days · from $75 (1 day,
//     member early)" · "3 extras" · Use (small outline button) · ⋯ (Edit template / Delete template)
//   - the location switcher doesn't filter this tab (templates are shared by both schools)
//   - empty: one line, no button — templates are made from a camp's ⋯ → Save as template
//   - a gray note under the list says how templates are made
// Admins only: staff don't see this tab (C1, 2026-10-19).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconDots } from '@tabler/icons-react';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import IconButton from '../../components/IconButton.jsx';
import RowMenu from '../../components/RowMenu.jsx';
import { deleteTemplate, loadTemplates } from '../../lib/camps/campsApi.js';
import ConfirmDeleteDialog from '../testing/events/ConfirmDeleteDialog.jsx';
import { useLiveLoad } from '../testing/events/useLiveLoad.js';
import { templateMenuItems } from './TemplateRowMenu.jsx';
import * as T from './text.js';

// useLiveLoad needs a key; templates aren't per school, so one fixed key.
const TEMPLATES_KEY = 'templates';
const loadAll = () => loadTemplates();

// The 1-day, member-early price of a template (the "from $75" in the list).
function oneDayPrice(template) {
  return (template.prices ?? []).find((p) => p.dayCount === 1)?.memberEarlyCents ?? 0;
}

export default function TemplatesTab({
  panelId,
  tabId,
  refreshKey,
  isPhone,
  onUse,
  onEdit,
  screenLocked,
  onNoAccess,
  onRefreshProfile,
  showToast,
  clearToast,
  onModalOpenChange,
}) {
  const live = useLiveLoad({ key: TEMPLATES_KEY, enabled: !screenLocked, load: loadAll });
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  });
  const templates = [...(live.data?.templates ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  const [menu, setMenu] = useState(null); // { id, anchor }
  const [banner, setBanner] = useState(null);
  const [confirm, setConfirm] = useState(null); // { template, opener, deleting, failed }

  useEffect(() => {
    if (refreshKey > 0) liveRef.current.reload();
  }, [refreshKey]);
  useEffect(() => {
    if (live.status === 'noAccess') onNoAccess();
  }, [live.status, onNoAccess]);
  useEffect(() => {
    if (screenLocked) setMenu(null);
  }, [screenLocked]);

  const confirmShown = confirm !== null && !screenLocked;
  useEffect(() => {
    onModalOpenChange(confirmShown);
  }, [confirmShown, onModalOpenChange]);
  useEffect(() => () => onModalOpenChange(false), [onModalOpenChange]);

  function closeMenu(reason) {
    const current = menu;
    setMenu(null);
    if (current && (reason === 'escape' || reason === 'tab')) current.anchor?.focus();
  }

  function startDelete(template, opener) {
    clearToast();
    setConfirm({ template, opener, deleting: false, failed: false });
  }
  function closeConfirm() {
    const opener = confirm?.opener;
    setConfirm(null);
    window.requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }
  async function confirmDelete() {
    if (!confirm || confirm.deleting) return;
    const { template } = confirm;
    setConfirm((c) => ({ ...c, deleting: true, failed: false }));
    const result = await deleteTemplate(template.id, template.version);
    if (result.status === 'ok') {
      setConfirm(null);
      showToast(T.deletedToast(template.name), { icon: false }); // permanent: no Undo
      liveRef.current.reload();
      return;
    }
    if (result.status === 'error') {
      setConfirm((c) => (c ? { ...c, deleting: false, failed: true } : c));
      return;
    }
    setConfirm(null);
    if (result.status === 'no_access') onNoAccess();
    else {
      setBanner({ text: result.status === 'not_allowed' ? T.CAMPS_NOT_ALLOWED : T.STALE });
      if (result.status === 'not_allowed') onRefreshProfile();
      liveRef.current.reload();
    }
  }

  let body;
  if (live.status === 'loading' || live.status === 'idle') {
    body = (
      <div className="clist tskeleton" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="tskeleton-row" aria-hidden="true">
            <span className="tskeleton-bar" />
          </div>
        ))}
      </div>
    );
  } else if (live.status === 'error') {
    body = <ErrorBanner text={T.LOAD_TEMPLATES_FAILED} onRetry={() => liveRef.current.reload()} />;
  } else if (live.status === 'noAccess') {
    body = null;
  } else if (templates.length === 0) {
    body = <p className="tempty ev-empty cp-empty-box">{T.NO_TEMPLATES}</p>;
  } else {
    body = (
      <>
        <div className={`clist ev-list cp-tlist${isPhone ? ' is-phone' : ''}`} role="table" aria-label={T.TAB_TEMPLATES}>
          {!isPhone && (
            <div className="ev-row ev-head cp-trow" role="row">
              <span className="ev-th" role="columnheader">
                {T.COL_TEMPLATE}
              </span>
              <span className="ev-th" role="columnheader">
                {T.COL_DAYS_PRICE}
              </span>
              <span className="ev-th" role="columnheader">
                {T.COL_EXTRAS}
              </span>
              <span className="ev-th" role="columnheader" aria-label={T.ACTIONS_COL} />
            </div>
          )}
          <div role="rowgroup">
            {templates.map((template) => {
              const price = T.templateDaysPrice(template.dayCount, oneDayPrice(template));
              const extras = T.extrasCount((template.extras ?? []).length);
              const open = menu?.id === template.id;
              const buttons = (
                <span className="acts cp-tacts" role="cell">
                  <button type="button" className="btn btn-sm" aria-label={T.useTemplateLabel(template.name)} onClick={(event) => onUse(template, event.currentTarget)}>
                    {T.USE}
                  </button>
                  <IconButton
                    label={T.moreFor(template.name)}
                    Icon={IconDots}
                    aria-haspopup="menu"
                    aria-expanded={open ? 'true' : 'false'}
                    onClick={(event) => {
                      if (isPhone) clearToast(); // a phone sheet: no toast floating over it
                      setMenu(open ? null : { id: template.id, anchor: event.currentTarget });
                    }}
                  />
                </span>
              );
              return isPhone ? (
                <div key={template.id} className={`ev-row cp-trow is-phone${open ? ' is-selected' : ''}`} role="row">
                  <span className="ev-phone-main" role="cell">
                    <span className="ev-name">{template.name}</span>
                    <span className="l2">{`${price} · ${extras}`}</span>
                  </span>
                  {buttons}
                </div>
              ) : (
                <div key={template.id} className={`ev-row cp-trow${open ? ' is-selected' : ''}`} role="row">
                  <span className="ev-name" role="cell">
                    {template.name}
                  </span>
                  <span role="cell">{price}</span>
                  <span role="cell">{extras}</span>
                  {buttons}
                </div>
              );
            })}
          </div>
        </div>
        <p className="field-hint cp-hint-line">{T.TEMPLATES_NOTE}</p>
      </>
    );
  }

  const menuTemplate = menu && !screenLocked ? templates.find((t) => t.id === menu.id) : null;
  return (
    <>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId} className="tpanel">
        {banner && <ErrorBanner text={banner.text} onDismiss={() => setBanner(null)} />}
        {body}
      </div>
      {menuTemplate && (
        <RowMenu
          anchor={menu.anchor}
          isSheet={isPhone}
          title={menuTemplate.name}
          subtitle={T.templateDaysPrice(menuTemplate.dayCount, oneDayPrice(menuTemplate))}
          label={T.moreFor(menuTemplate.name)}
          items={templateMenuItems(menuTemplate, menu.anchor, { onEdit, onDelete: startDelete, busy: Boolean(confirm?.deleting) })}
          onClose={closeMenu}
        />
      )}
      {confirmShown && (
        <ConfirmDeleteDialog
          title={T.deleteTemplateTitle(confirm.template.name)}
          body={T.DELETE_TEMPLATE_BODY}
          keepLabel={T.KEEP_TEMPLATE}
          deleteLabel={T.DELETE_TEMPLATE}
          failed={confirm.failed}
          deleting={confirm.deleting}
          onDelete={confirmDelete}
          onCancel={() => !confirm.deleting && closeConfirm()}
        />
      )}
    </>
  );
}
