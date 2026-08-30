# S&I Freitas — Sistema de Gestão Hoteleira

Sistema interno de gestão para a Hospedaria S&I Freitas, Lubango, Angola.  
Stack: **Next.js 14 · Supabase · Tailwind CSS · Vercel**

---

## Pré-requisitos

- Node.js 18+ instalado
- Conta no [GitHub](https://github.com)
- Conta na [Vercel](https://vercel.com)
- Projeto criado no [Supabase](https://supabase.com) com o schema aplicado

---

## 1. Clonar e instalar localmente

```bash
git clone https://github.com/SEU_USUARIO/hotel-si-freitas.git
cd hotel-si-freitas
npm install
```

---

## 2. Configurar as variáveis de ambiente

```bash
cp .env.example .env.local
```

Abre o `.env.local` e preenche com os valores do teu projeto Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Encontras estes valores em:  
**Supabase Dashboard → Project Settings → API**

---

## 3. Correr localmente

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) no browser.

---

## 4. Colocar no GitHub

### Se o repositório ainda não existe:

1. Vai a [github.com/new](https://github.com/new)
2. Cria um repositório com o nome `hotel-si-freitas` (privado, recomendado)
3. Não inicializes com README (já tens um)

### No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "chore: setup inicial do projeto"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/hotel-si-freitas.git
git push -u origin main
```

Substitui `SEU_USUARIO` pelo teu nome de utilizador do GitHub.

---

## 5. Deploy na Vercel

### Opção A — Via interface web (mais fácil):

1. Vai a [vercel.com/new](https://vercel.com/new)
2. Clica em **"Import Git Repository"**
3. Seleciona o repositório `hotel-si-freitas`
4. Em **"Environment Variables"**, adiciona as 3 variáveis do `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Clica em **"Deploy"**

A Vercel deteta automaticamente que é um projeto Next.js — não precisas configurar mais nada.

### Opção B — Via CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

---

## 6. Criar utilizadores no sistema

Cada funcionário precisa de uma conta no Supabase e de um registo na tabela `staff`.

### Passo 1 — Criar a conta de autenticação:
1. Supabase Dashboard → **Authentication → Users → Invite user**
2. Introduz o email do funcionário

### Passo 2 — Criar o registo na tabela staff:
No SQL Editor do Supabase:

```sql
insert into staff (id, property_id, full_name, role, phone)
values (
    'UUID_DO_UTILIZADOR_CRIADO_NO_PASSO_1',
    '00000000-0000-0000-0000-000000000001',
    'Nome do Funcionário',
    'rececionista',   -- ou: 'gerencia' / 'limpeza' / 'admin'
    '+244 9XX XXX XXX'
);
```

O `UUID_DO_UTILIZADOR` encontras em Authentication → Users → coluna "UID".

---

## 7. Aplicar o schema no Supabase (se ainda não o fizeste)

Aplica os ficheiros SQL nesta ordem no **SQL Editor** do Supabase:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_seed_data.sql`
3. `supabase/migrations/003_daily_summary_function.sql`
4. `supabase/migrations/004_rls_policies.sql`

---

## Estrutura do projeto

```
hotel-si-freitas/
├── app/
│   ├── auth/login/         # Página de login
│   ├── dashboard/          # Dashboard principal + layout com sidebar
│   ├── check-in/           # Registo de check-in
│   ├── quartos/            # Mapa e gestão de quartos
│   ├── pequeno-almoco/     # Registo de pequenos-almoços
│   ├── lavandaria/         # Registo de lavandaria
│   └── relatorio/          # Relatório diário
├── components/
│   ├── layout/             # Sidebar, Header
│   └── ui/                 # Componentes reutilizáveis
├── lib/
│   └── supabase/           # Clientes server e client do Supabase
├── types/                  # Tipos TypeScript do schema
├── supabase/migrations/    # Ficheiros SQL do schema
└── middleware.ts           # Proteção de rotas por sessão
```

---

## Módulos disponíveis

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/dashboard` | Ocupação em tempo real e resumo financeiro |
| Mapa de quartos | `/quartos` | Estado de cada quarto (vago/ocupado/limpeza/manutenção) |
| Check-in | `/check-in` | Registo de entrada de hóspedes |
| Pequeno-almoço | `/pequeno-almoco` | Registo diário de consumo |
| Lavandaria | `/lavandaria` | Pedidos e cobranças de lavandaria |
| Relatório diário | `/relatorio` | Resumo automático para aprovação e envio |

---

## Suporte

Para questões técnicas, contactar o responsável pelo sistema.
