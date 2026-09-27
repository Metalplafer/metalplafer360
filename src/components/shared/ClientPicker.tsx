import { useEffect, useState } from 'react';
import { Building2, User, X } from 'lucide-react';
import { suggestClients } from '@/services/clients';
import { useDebounce } from '@/hooks/useDebounce';
import { CLIENT_KIND_LABEL } from '@/config/constants';
import type { ClientKind, ClientSuggestion } from '@/types/db';

export interface ClientDraft {
  id: string | null;
  kind: ClientKind;
  name: string;
  tax_id: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
}

export const emptyClient: ClientDraft = {
  id: null, kind: 'empresa', name: '', tax_id: '',
  phone: '', email: '', address: '', city: '', postal_code: '',
};

/**
 * Elegir un cliente existente o dar de alta uno nuevo.
 *
 * Mientras se escribe el nombre o el CIF/NIF propone clientes parecidos.
 * Al elegir uno se rellenan SOLO sus datos generales; nunca se copia
 * información de presupuestos o proyectos anteriores.
 */
export function ClientPicker({ value, onChange, required }: {
  value: ClientDraft;
  onChange: (v: ClientDraft) => void;
  required?: boolean;
}) {
  const [focused, setFocused] = useState<'name' | 'tax' | null>(null);
  const [items, setItems] = useState<ClientSuggestion[]>([]);
  const [dismissed, setDismissed] = useState('');

  const query = focused === 'tax' ? value.tax_id : value.name;
  const debounced = useDebounce(query, 250);

  useEffect(() => {
    const minimum = focused === 'tax' ? 3 : 2;
    if (value.id || !focused || debounced.trim().length < minimum || debounced === dismissed) {
      setItems([]);
      return;
    }
    let alive = true;
    suggestClients(debounced).then((r) => { if (alive) setItems(r); }).catch(() => setItems([]));
    return () => { alive = false; };
  }, [debounced, focused, value.id, dismissed]);

  const set = (patch: Partial<ClientDraft>) => onChange({ ...value, ...patch });

  const pick = (c: ClientSuggestion) => {
    onChange({
      id: c.id, kind: c.kind, name: c.name, tax_id: c.tax_id ?? '',
      phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '',
      city: c.city ?? '', postal_code: c.postal_code ?? '',
    });
    setItems([]);
  };

  // Cliente ya elegido: se muestra resumido, con opción de cambiarlo.
  if (value.id) {
    return (
      <div className="alert alert-ok" style={{ alignItems: 'center' }}>
        {value.kind === 'empresa' ? <Building2 /> : <User />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{value.name}</strong>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            {[CLIENT_KIND_LABEL[value.kind], value.tax_id, value.phone, value.city].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => onChange({ ...emptyClient })}>
          <X size={15} />Cambiar
        </button>
      </div>
    );
  }

  const suggestions = items.length > 0 && (
    <div className="suggest-box" role="listbox" aria-label="Clientes parecidos">
      <div className="title">¿Es alguno de estos clientes?</div>
      {items.map((c) => (
        <button type="button" key={c.id} role="option" aria-selected={false}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
          <strong>{c.name}</strong>
          <small>{[CLIENT_KIND_LABEL[c.kind], c.tax_id, c.city, c.phone].filter(Boolean).join(' · ')}</small>
        </button>
      ))}
      <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setDismissed(debounced); setItems([]); }}>
        <small>No, es un cliente nuevo</small>
      </button>
    </div>
  );

  return (
    <div className="form-grid">
      <div className="field span-2">
        <span className="label">Tipo de cliente</span>
        <div className="segmented" role="group" aria-label="Tipo de cliente">
          <button type="button" aria-pressed={value.kind === 'empresa'} onClick={() => set({ kind: 'empresa' })}>
            Empresa
          </button>
          <button type="button" aria-pressed={value.kind === 'particular'} onClick={() => set({ kind: 'particular' })}>
            Particular
          </button>
        </div>
      </div>

      <div className="field suggest">
        <label htmlFor="cp-name">Nombre del cliente{required ? ' *' : ''}</label>
        <input id="cp-name" className="input" value={value.name} autoComplete="off"
               onFocus={() => setFocused('name')} onBlur={() => setTimeout(() => setFocused(null), 150)}
               onChange={(e) => set({ name: e.target.value })} />
        {focused === 'name' && suggestions}
      </div>

      <div className="field suggest">
        <label htmlFor="cp-tax">CIF/NIF</label>
        <input id="cp-tax" className="input" value={value.tax_id} autoComplete="off"
               onFocus={() => setFocused('tax')} onBlur={() => setTimeout(() => setFocused(null), 150)}
               onChange={(e) => set({ tax_id: e.target.value.toUpperCase() })} />
        {focused === 'tax' ? suggestions : <span className="hint">Opcional</span>}
      </div>

      <div className="field">
        <label htmlFor="cp-phone">Teléfono</label>
        <input id="cp-phone" className="input" inputMode="tel" value={value.phone}
               onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="cp-email">Email</label>
        <input id="cp-email" className="input" type="email" value={value.email}
               onChange={(e) => set({ email: e.target.value })} />
      </div>
      <div className="field span-2">
        <label htmlFor="cp-address">Dirección del cliente</label>
        <input id="cp-address" className="input" value={value.address}
               onChange={(e) => set({ address: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="cp-city">Población</label>
        <input id="cp-city" className="input" value={value.city}
               onChange={(e) => set({ city: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="cp-cp">Código postal</label>
        <input id="cp-cp" className="input" inputMode="numeric" value={value.postal_code}
               onChange={(e) => set({ postal_code: e.target.value })} />
      </div>
    </div>
  );
}
