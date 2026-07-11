---
name: WhatsApp Bot Modes
description: Como o bot se comporta em cada modo de conversa
---
Três modos: bot (padrão), human, supplier.

- **bot**: fluxo normal idle→menu→branch→dept→category→description→active.
- **human**: bot completamente silencioso; apenas salva mensagens no chamado. Persiste até ticket ser fechado. Reset ao fechar.
- **supplier**: silencioso como human; gera ticket automaticamente ao entrar no modo. Ao fechar: NÃO envia mensagem de encerramento ao cliente.

Quando operador envia mensagem pelo celular (fromMe=true, não from bot): se não há ticket ativo, cria automaticamente em modo human.

Clientes recorrentes: mantém branch_id/department_id do último chamado, mas vai para step "category" (não pula para description).

**Why:** v1.1 requirements — operador pode iniciar conversa e virar chamado, modo supplier deve gerar ticket, recorrente deve escolher categoria.
**How to apply:** Ver whatsapp.ts — handlers fromMe, modo supplier (menu "2"), notifyStatusChange (fechamento).
