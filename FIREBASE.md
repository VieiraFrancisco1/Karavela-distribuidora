# Migração da Karavela Distribuidora

O catálogo e os 181 ajustes de fotos atuais foram preservados. O site passa a usar Firebase Hosting, Firebase Authentication e Cloud Firestore, sem depender das antigas APIs administrativas do Vercel.

## Publicar

Execute `Publicar-Firebase.ps1` no Windows com Node.js LTS instalado. O script também funciona sozinho: baixa este projeto, instala as dependências, abre o login oficial do Google, cria o projeto se necessário, ativa email e senha, prepara o Firestore, migra as fotos e publica o site.

Conta Firebase: `0vieira.francisco0@gmail.com`. O projeto `karavela-distribuidora-bv` e o aplicativo web já foram criados nessa conta, no plano Spark. O login por email e senha está ativado. O Firestore `(default)` foi criado na região `southamerica-east1` (São Paulo), em modo de produção, com todas as leituras e gravações de clientes inicialmente bloqueadas. A configuração pública real do aplicativo está em `src/firebase.public.json`.

A publicação no Hosting ainda está pendente. O Hosting já foi inicializado, mas aguarda a primeira versão. O Cloud Shell e a página de IAM do Google Cloud estão indisponíveis neste navegador. Para publicar pelo ambiente de desenvolvimento, há uma opção de credencial temporária, restrita a esse projeto. A concessão das permissões e a geração da chave exigem confirmação específica antes da execução.

### Publicação com credencial temporária

Depois de criar uma conta de serviço de publicação no projeto correto, conceda somente os papéis **Administrador do Firebase** e **Consumidor do Service Usage**, no próprio projeto. A conta não precisa de acesso a outros projetos. Habilite Authentication, Firestore e Hosting pelo console antes de executar; esse modo não habilita serviços nem amplia permissões.

Guarde o arquivo de credenciais fora do repositório, com acesso restrito, e indique seu caminho em `GOOGLE_APPLICATION_CREDENTIALS`. Nunca envie esse arquivo ao GitHub, coloque-o na pasta pública ou compartilhe seu conteúdo em mensagens. Execute:

```sh
npm run firebase:publish -- --service-account --project karavela-distribuidora-bv --owner-email 0vieira.francisco0@gmail.com
```

O script recusa credenciais de outro projeto antes de acessar as APIs. Ao terminar e verificar a publicação, desative a conta de serviço temporária. As publicações seguintes exigem nova autenticação autorizada.

Quando o IAM do Google Cloud estiver indisponível, o console do Firebase permite preparar o papel **Editor** para a conta técnica do SDK Admin já existente, `firebase-adminsdk-fbsvc@karavela-distribuidora-bv.iam.gserviceaccount.com`. Esse acesso permite alterar os recursos do Firebase e Google Cloud somente neste projeto. Não foi concedido ainda.

Para esse caminho, após a aprovação específica da permissão e da geração da chave, acrescente `--disable-publisher` ao comando. Depois de confirmar a página publicada, o script desativa a chave usada e essa conta técnica pela API oficial de IAM. A desativação é reversível pelo dono no Google Cloud e não afeta o login dos clientes, que usa diretamente o Firebase Authentication. Não use esse modo em uma conta técnica de outros sistemas: ele desativa toda a identidade técnica informada.

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

Os emuladores da CLI 15 exigem Java 21. Neste ambiente, os seis testes Firebase também passaram usando a CLI oficial 14.27.0 e Java 17; os quatro testes de modelos, os três testes de proteção da publicação, o TypeScript e a compilação passaram. Foram verificados login por email/telefone, isolamento de clientes, tentativas de promoção administrativa, status/totais protegidos, finalização/exclusão/restauração, envio repetido sem duplicação, rejeição de credenciais ausentes ou de outro projeto e proteção contra desativação fora do modo explícito de conta de serviço.

A publicação online e o login real da conta administrativa ainda precisam ser verificados. O script não habilita cobrança, Cloud Functions nem Cloud Storage.
