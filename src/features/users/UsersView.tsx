import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';

import { entityAction, subPath, withSearch } from '@/shared/lib/modal-route';

import { ApiError } from '@/shared/api/client';
import { createUser, listUsers, updateUser, type UserDto } from '@/shared/api/users';
import { formatDateTime } from '@/shared/lib/dates';
import { showNotice } from '@/shared/state/notices';
import { isOwner } from '@/shared/state/session';
import { Chip } from '@/shared/ui/Chip';
import { TableFooter } from '@/shared/ui/TableFooter';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

const ROLE_LABELS: Record<UserDto['role'], string> = {
  owner: 'Dueño',
  manager: 'Encargado',
  cashier: 'Cajera',
};

const USUARIOS_PATH = '/ajustes/usuarios';
const ACCIONES = ['editar', 'pin'] as const;

type UserFormMode = { kind: 'create' } | { kind: 'edit'; user: UserDto };

const UserFormModal: Component<{
  mode: UserFormMode;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.mode.kind === 'edit' ? props.mode.user : null;
  const [name, setName] = createSignal(editing?.name ?? '');
  const [role, setRole] = createSignal<UserDto['role']>(editing?.role ?? 'cashier');
  const [pin, setPin] = createSignal('');
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [error, setError] = createSignal('');

  const pinValid = () => /^\d{4,6}$/.test(pin()) || (editing !== null && pin() === '');

  const [saving, setSaving] = createSignal(false);
  async function save(): Promise<void> {
    if (saving() || name().trim() === '' || !pinValid()) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="md"
      title={editing === null ? 'Nuevo usuario' : 'Editar usuario'}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={saving() || name().trim() === '' || !pinValid()} onClick={save}>
            {editing === null ? 'Crear usuario' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
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
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRole(value === 'owner' ? 'owner' : value === 'manager' ? 'manager' : 'cashier');
              }}
            >
              <option value="cashier">Cajera</option>
              <option value="manager">Encargado</option>
              <Show when={isOwner()}>
                <option value="owner">Dueño</option>
              </Show>
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
    <Modal
      size="sm"
      title={`Resetear PIN — ${props.user.name}`}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={!pinValid()}
            onClick={() => void save()}
          >
            Cambiar PIN
          </button>
        </div>
      }
    >
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
      </div>
    </Modal>
  );
};

export const UsersView: Component = () => {
  const [users, { refetch }] = createResource(listUsers);
  // Qué modal está abierto lo dice la URL: `/ajustes/usuarios/<id>/pin`.
  const location = useLocation();
  const navigate = useNavigate();
  const cola = () => subPath(USUARIOS_PATH, location.pathname);
  const creando = (): boolean => cola()[0] === 'nuevo' && cola().length === 1;
  const abierto = () => entityAction(cola(), ACCIONES);
  const abrir = (path: string): void => navigate(withSearch(path, location.search));
  const cerrar = (): void => navigate(withSearch(USUARIOS_PATH, location.search));

  // Los usuarios se listan todos, así que el del modal ya está cargado.
  const usuario = (): UserDto | undefined => {
    const modal = abierto();
    if (modal === undefined) return undefined;
    return (users() ?? []).find((user) => user.id === modal.id);
  };

  createEffect(() => {
    if (abierto() === undefined || users.loading) return;
    if (usuario() !== undefined) return;
    showNotice('Ese usuario ya no está');
    navigate(withSearch(USUARIOS_PATH, location.search), { replace: true });
  });

  function closeAndRefresh(message: string): void {
    cerrar();
    showNotice(message);
    void refetch();
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <span class={tabla.sub} style={{ flex: '1' }}>
          El PIN identifica a cada persona: con él entra al sistema y firma sus operaciones.
        </span>
        <button type="button" class={tabla.nuevo} onClick={() => abrir(`${USUARIOS_PATH}/nuevo`)}>
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
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td class={tabla.sub}>
                    {user.lastLoginAt === null ? 'nunca' : formatDateTime(user.lastLoginAt)}
                  </td>
                  <td>
                    <Chip tone={user.active ? 'exito' : 'neutro'}>
                      {user.active ? 'activo' : 'inactivo'}
                    </Chip>
                  </td>
                  <td class={tabla.acciones}>
                    {/* Cuentas de dueño: solo otro dueño las toca (el API
                        también lo bloquea — esto solo evita el 403). Sin
                        permiso, la fila explica por qué no hay botones. */}
                    <Show
                      when={isOwner() || user.role !== 'owner'}
                      fallback={
                        <span class={tabla.sub} title="Las cuentas de dueño solo las edita otro dueño">
                          solo el dueño edita esta cuenta
                        </span>
                      }
                    >
                      <button type="button" onClick={() => abrir(`${USUARIOS_PATH}/${user.id}/editar`)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        title="Cambiar el PIN sin tocar nada más del usuario"
                        onClick={() => abrir(`${USUARIOS_PATH}/${user.id}/pin`)}
                      >
                        Resetear PIN
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!users.loading && (users() ?? []).length === 0}>
          <EmptyState message="Todavía no hay usuarios dados de alta." />
        </Show>
      </div>
      <TableFooter total={(users() ?? []).length} singular="usuario" plural="usuarios" />

      {(() => {
        if (creando()) {
          return <UserFormModal mode={{ kind: 'create' }} onDone={closeAndRefresh} onClose={cerrar} />;
        }
        const modal = abierto();
        const user = usuario();
        if (modal === undefined || user === undefined) return null;
        if (modal.action === 'pin') {
          return <ResetPinModal user={user} onDone={closeAndRefresh} onClose={cerrar} />;
        }
        return <UserFormModal mode={{ kind: 'edit', user }} onDone={closeAndRefresh} onClose={cerrar} />;
      })()}
    </section>
  );
};
