# Migração da Karavela Distribuidora

O catálogo e os 181 ajustes de fotos atuais foram preservados. O site passa a usar Firebase Hosting, Firebase Authentication e Cloud Firestore, sem depender das antigas APIs administrativas do Vercel.

## Publicar

Execute `Publicar-Firebase.ps1` no Windows com Node.js LTS instalado. O script também funciona sozinho: baixa este projeto, instala as dependências, abre o login oficial do Google, cria o projeto se necessário, ativa email e senha, prepara o Firestore, migra as fotos e publica o site.

Conta Firebase inicial: `0vieira.francisco0@gmail.com`. Projeto sugerido: `karavela-distribuidora-bv`. A criação/publicação online não foi executada pelo assistente porque o Google retornou 502 no ambiente e nenhuma credencial Firebase estava disponível.

Se o dono usar outro email, informe o parâmetro antes da primeira publicação:

```powershell
.\Publicar-Firebase.ps1 -EmailDono 'email-do-dono@exemplo.com'
```

Depois de publicar, crie a conta no site com o email administrativo escolhido e confirme o email pelo link recebido. O botão **Administrar loja** só aparece para essa conta confirmada. A senha é criada pelo próprio dono; nenhuma senha compartilhada é gravada no código.

O script gera `src/firebase.public.json` e `.firebaserc`. A configuração do aplicativo web é pública, como previsto pelo Firebase; as permissões dependem de `firestore.rules`. Guarde esses arquivos para as próximas compilações. Uma segunda execução preserva configurações e pedidos já existentes e não troca um administrador diferente silenciosamente.

## Clientes e pedidos

O catálogo e o carrinho funcionam sem login. Para enviar ou acompanhar pedidos, o cliente entra ou cria sua conta. Cada cadastro escolhe **email ou telefone e senha** como identidade; esses dois identificadores não são vinculados automaticamente. Telefones usam uma identidade interna de autenticação por senha, sem SMS e sem afirmar que o número foi verificado. A recuperação de senha por email está disponível para contas cadastradas com email.

O pedido só é gravado no evento do botão **Enviar pedido para o WhatsApp**, antes de abrir a conversa. O envio da mensagem dentro do WhatsApp continua sendo uma ação do cliente. Adicionar itens, abrir carrinho ou escolher pagamento não cria pedidos. Erros de gravação mantêm o carrinho; tentativas repetidas usam o mesmo identificador até o banco confirmar a gravação. Depois da confirmação, o carrinho é limpo e uma compra seguinte recebe um novo identificador.

Clientes podem consultar seus próprios pedidos. Somente o dono pode finalizar ou excluir. A exclusão retira o pedido do controle e dos relatórios; **Excluídos** permite restaurar. Valores de pedidos pendentes são calculados com o catálogo da aplicação; na finalização, o dono confirma e grava os valores para preservar o histórico. Clientes não podem escrever totais confirmados nem alterar status.

Relatórios diários e mensais usam o horário de Fortaleza e a data de criação do pedido. Receita, pagamentos e entregas incluem somente pedidos finalizados e não excluídos. A exportação CSV abre em Excel/LibreOffice.

## Fotos e acesso

As fotos existentes continuam com suas URLs atuais. Novos uploads são preparados em WebP e gravados em documentos imutáveis do Firestore com limite de tamanho. Os ajustes do card e da tela do produto ficam no documento de mídia; apenas os campos alterados são mesclados em transação. A leitura das fotos do catálogo é pública. Upload e alteração do catálogo exigem a conta administrativa confirmada.

`access/owner` e `access/catalog` são preparados com a credencial administrativa da CLI; nenhum cliente pode alterá-los. Não há criação de perfis administrativos pelo cadastro. As antigas funções em `api/` foram removidas nesta migração.

## Validar

```sh
npm run typecheck
npm test
npm run test:firebase
npm run build
```

Os emuladores da CLI 15 exigem Java 21. Neste ambiente, os seis testes Firebase também passaram usando a CLI oficial 14.27.0 e Java 17; os quatro testes de modelos, o TypeScript e a compilação passaram. Foram verificados login por email/telefone, isolamento de clientes, tentativas de promoção administrativa, status/totais protegidos, finalização/exclusão/restauração e envio repetido sem duplicação.

A publicação online e o login real da conta administrativa precisam ser confirmados depois da autenticação Google. O script não habilita cobrança, Cloud Functions nem Cloud Storage.
