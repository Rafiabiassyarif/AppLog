import React from 'react';

export function Brand({light=false}){
 return <a href="/" className={'brand '+(light?'brand-light':'')} aria-label="AppLog — Beranda"><img src="/logo.svg" alt=""/><span>AppLog<span className="brand-period">.</span></span></a>;
}

export function Button({children,secondary=false,accent=false,href,className='',...props}){
 const Element=href?'a':'button';
 return <Element href={href} className={['btn',accent?'btn-accent':secondary?'btn-secondary':'btn-primary',className].filter(Boolean).join(' ')} {...props}>{children}</Element>;
}
