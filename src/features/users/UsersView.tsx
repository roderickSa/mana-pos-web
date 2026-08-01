import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import { createUser, listUsers, updateUser, type UserDto } from '@/shared/api/users';
import { formatDateTime } from '@/shared/lib/dates';
import { showNotice } from '@/shared/state/notices';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: UserDto }
  | { kind: 'pin'; user: UserDto };

const UserFormModal: Component<{
  user: UserDto | null;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.user;
  const [name, setName] = createSignal(editing?.name ?? '');
  const [role, setRole] = createSignal<'manager' | 'cashier'>(editing?.role ?? 'cashier');
  const [pin, setPin] = createSignal('');
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [error, setError] = createSignal('');

  const pinValid = () => /^\d{4,6}$/.test(pin()) || (editing !== null && pin() === '');

  async function save(): Promise<void> {
    if (name().trim() === '' || !pinValid()) return;
    try {
      if (editing === null) {
        await createUser(name().trim(), pin(), role());
        props.onDone(`Usuario «${name().trim()}» creado`);
      } else {
        await updateUser(editing.id, {
          name: name().trim(),
          role: role(),
          active: active(),
          newPin: pin() === '' ? null : pin(),
        });
        props.onDone(`Usuario «${name().trim()}» actualizado`);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.serverMessage !== null
          ? cause.serverMessage
          : 'No se pudo guardar el usuario.',
      );
    }
  }

  return (
    <Modal title={editing === null ? 'Nuevo usuario' : 'Editar usuario'} onClose={props.onClose}>
      <div class={forms.form}>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Nombre</span>
            <input class={forms.input} value={name()} onInput={(event) => setName(event.currentTarget.value)} autofocus />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Perfil</span>
            <select
              class={forms.select}
              value={role()}
              onChange={(event) => setRole(event.currentTarget.value === 'manager' ? 'manager' : 'cashier')}
            >
              <option value="cashier">Cajera</option>
              <option value="manager">Encargado</option>
            </select>
          </div>
        </div>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>
            PIN (4-6 dígitos{editing !== null ? ' — vacío para no cambiarlo' : ''})
          </span>
          <input
            class={forms.input}
            type="password"
            inputmode="numeric"
            maxLength={6}
            value={pin()}
            onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
          />
        </div>
        <Show when={editing !== null}>
          <label class={forms.check}>
            <input type="checkbox" checked={active()} onChange={(event) => setActive(event.currentTarget.checked)} />
            Activo (puede entrar al sistema)
          </label>
        </Show>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={name().trim() === '' || !pinValid()} onClick={save}>
            {editing === null ? 'Crear usuario' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Resetear PIN desde la lista: lo único que pide es el PIN nuevo.
const ResetPinModal: Component<{
  user: UserDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [pin, setPin] = createSignal('');
  const [error, setError] = createSignal('');
  const pinValid = () => /^\d{4,6}$/.test(pin());

  async function save(): Promise<void> {
    if (!pinValid()) return;
    try {
      await updateUser(props.user.id, {
        name: props.user.name,
        role: props.user.role,
        active: props.user.active,
        newPin: pin(),
      });
      props.onDone(`PIN de «${props.user.name}» actualizado`);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.serverMessage !== null
          ? cause.serverMessage
          : 'No se pudo cambiar el PIN.',
      );
    }
  }

  return (
    <Modal size="sm" title={`Resetear PIN — ${props.user.name}`} onClose={props.onClose}>
      <div class={forms.form}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>PIN nuevo (4-6 dígitos)</span>
          <input
            class={forms.input}
            type="password"
            inputmode="numeric"
            maxLength={6}
            value={pin()}
            onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
            autofocus
          />
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={!pinValid()} onClick={() => void save()}>
            Cambiar PIN
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const UsersView: Component = () => {
  const [users, { refetch }] = createResource(listUsers);
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  function closeAndRefresh(message: string): void {
    setModal({ kind: 'none' });
    showNotice(message);
    void refetch();
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <span class={tabla.sub} style={{ flex: '1' }}>
          El PIN identifica a cada persona: con él entra al sistema y firma sus operaciones.
        </span>
        <button type="button" class={tabla.nuevo} onClick={() => setModal({ kind: 'create' })}>
          + Nuevo usuario
        </button>
      </div>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Perfil</th>
              <th>Último acceso</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={users() ?? []}>
              {(user) => (
                <tr classList={{ [tabla.inactivo]: !user.active }}>
                  <td class={tabla.nombre}>{user.name}</td>
                  <td>{user.role === 'manager' ? 'Encargado' : 'Cajera'}</td>
                  <td class={tabla.sub}>
                    {user.lastLoginAt === null ? 'nunca' : formatDateTime(user.lastLoginAt)}
                  </td>
                  <td class={tabla.sub}>{user.active ? 'activo' : 'inactivo'}</td>
                  <td class={tabla.acciones}>
                    <button type="button" onClick={() => setModal({ kind: 'edit', user })}>
                      Editar
                    </button>
                    <button
                      type="button"
                      title="Cambiar el PIN sin tocar nada más del usuario"
                      onClick={() => setModal({ kind: 'pin', user })}
                    >
                      Resetear PIN
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      {(() => {
        const state = modal();
        switch (state.kind) {
          case 'none':
            return null;
          case 'create':
            return <UserFormModal user={null} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />;
          case 'edit':
            return <UserFormModal user={state.user} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />;
          case 'pin':
            return <ResetPinModal user={state.user} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />;
        }
      })()}
    </section>
  );
};
