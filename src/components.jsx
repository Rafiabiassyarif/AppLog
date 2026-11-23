import React, { useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { STATUS_CLASS, initials } from './lib/format.js';

export function Brand({ light = false, href = '/', onClick }) {
  return (
    <a href={href} onClick={onClick} className={'brand ' + (light ? 'brand-light' : '')} aria-label="AppLog — Beranda">
      <img src="/logo.svg" alt="" />
      <span>AppLog<span className="brand-period">.</span></span>
    </a>
  );
}

export function Button({ children, secondary = false, accent = false, danger = false, href, className = '', ...props }) {
  const Element = href ? 'a' : 'button';
  const variant = danger ? 'btn-danger' : accent ? 'btn-accent' : secondary ? 'btn-secondary' : 'btn-primary';
  return <Element href={href} className={['btn', variant, className].filter(Boolean).join(' ')} {...props}>{children}</Element>;
}

export function PageHeading({ info, action }) {
  return (
    <div className="page-heading">
      <h1>{info.title}</h1>
      {action}
    </div>
  );
}

export function Badge({ status }) {
  return <span className={'status ' + (STATUS_CLASS[status] || '')}><i />{status}</span>;
}

export function Avatar({ name, photo, size = '' }) {
  const className = ['avatar', size, photo ? 'has-photo' : ''].filter(Boolean).join(' ');
  return <span className={className}>{photo ? <img src={photo} alt="" /> : initials(name)}</span>;
}

export function Toast({ toast }) {
  if (!toast) return null;
  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div key={toast.id} className={'toast ' + (toast.type === 'error' ? 'toast-error' : '')} role={toast.type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} />{toast.text}
    </div>
  );
}

const FOCUSABLE = 'button,input,textarea,select,a[href]';

export function Modal({ title, subtitle, children, close, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !ref.current) return;
      const list = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled);
      const first = list[0];
      const last = list.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className={'modal ' + (wide ? 'modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" type="button" onClick={close} aria-label="Tutup dialog"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmModal({ title, subtitle, message, confirmLabel, busy, onConfirm, close, danger = true }) {
  return (
    <Modal title={title} subtitle={subtitle} close={close}>
      <p className="delete-description">{message}</p>
      <div className="modal-footer">
        <Button secondary type="button" onClick={close} disabled={busy}>Batal</Button>
        <Button danger={danger} type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Memproses...' : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label="Navigasi halaman">
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Sebelumnya</button>
      <span>Halaman {page} dari {pageCount}</span>
      <button type="button" className="btn btn-secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Berikutnya</button>
    </nav>
  );
}
