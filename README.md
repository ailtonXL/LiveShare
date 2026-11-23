# LiveForge Studio

Site de transmissão de tela ao vivo via **WebRTC P2P**, com escolha de resolução, FPS, codec (AV1, H.265/HEVC, VP9, H.264/AVC, VP8), bitrate, áudio do sistema e adaptação à conexão.

## Executar (sem dependências)

Requer Node.js **20 ou mais recente**.

```bash
npm start
```

Ou `node server.js`. Abra **http://localhost:3000** no computador transmissor. Clique em **Iniciar transmissão**, permita a captura da tela e envie o link da sala aos espectadores.

### Instalação automática no Windows

1. Extraia todo o arquivo ZIP.
2. Abra a pasta `LiveForge` e execute **`instalar.bat`** com um duplo clique, escolhendo **[3] Somente local** (ou diretamente `instalar_local.bat`).
3. Caso o Node.js 20+ não esteja disponível, o instalador tenta instalar a versão LTS usando o **winget** (o Windows pode solicitar confirmação ou privilégios). Se o winget não estiver disponível, ele abre a página oficial do Node.js para instalação manual.
4. O instalador local tenta criar um atalho **LiveForge Studio** na área de trabalho. Ao final, escolha se deseja iniciar o site.
5. Para iniciar novamente depois, use o atalho ou o arquivo `iniciar_windows.bat`. O site fica disponível em **http://localhost:3000** enquanto o servidor estiver em execução.

**Observação:** o projeto não exige `npm install`: ele usa apenas recursos nativos do Node.js. O instalador não configura um serviço do Windows, HTTPS nem acesso remoto público automaticamente. Para compartilhar a transmissão com outros dispositivos fora de `localhost`, consulte a seção de publicação abaixo.

## Aplicativo para Windows 10 e 11 (64 bits)

A versão desktop (Electron) foi preservada no repositório GitHub. Acesse o [workflow de build para Windows](https://github.com/ailtonXL/LiveShare/actions/workflows/windows-desktop.yml), baixe o artefato gerado e instale o aplicativo. Para compilar localmente, execute `npm ci` e `npm run dist:win`.

O aplicativo também utiliza o servidor Node.js, inicializado internamente. Para expor transmissões fora da rede local, use HTTPS e, quando necessário, um servidor TURN.

## Opções de ambiente

| Variável | Padrão | Explicação |
|---|---|---|
| `PORT` | `3000` | Porta HTTP do site |
| `MAX_VIEWERS` | `12` | Limite de espectadores P2P por sala |
| `MAX_ROOMS` | `100` | Quantidade máxima de salas |
| `TURN_URL` | não definido | URLs TURN separadas por vírgula, por exemplo `turn:turn.exemplo.com:3478` |
| `TURN_USERNAME` | não definido | Usuário TURN |
| `TURN_CREDENTIAL` | não definido | Senha TURN |

Exemplo Linux/macOS:

```bash
PORT=3000 TURN_URL=turn:turn.exemplo.com:3478 TURN_USERNAME=conta TURN_CREDENTIAL=senha npm start
```

Windows PowerShell:

```powershell
$env:PORT='3000'; npm start
```

## Notas técnicas e limitações

- O compartilhamento de tela precisa de **HTTPS** quando acessado fora de `localhost` (inclusive por outra máquina em rede local). Em produção, configure HTTPS por Caddy, Nginx, Traefik ou equivalente.
- WebRTC faz negociação dos codecs. H.265 e AV1 só funcionam quando o navegador transmissor **e** receptor os aceitam. A lista detectada indica suporte provável, não garante uso efetivo.
- A aceleração por hardware é administrada pelo navegador e pelo sistema. Sites não podem selecionar diretamente a GPU ou obrigar NVENC, AMF, Quick Sync, etc. O codec efetivamente negociado aparece nas estatísticas.
- A resolução real depende do monitor ou janela de origem, do navegador e da capacidade da rede. Escolher 4K não converte magicamente uma fonte 1080p em 4K. A qualidade é ajustada via `RTCRtpSender.setParameters` quando suportado.
- O áudio do sistema é oferecido apenas em determinadas combinações de navegador, sistema e superfície compartilhada.
- Streaming usa conexões **P2P separadas por espectador** (mesh de um emissor para cada viewer). Por isso 12 é apenas um limite de proteção, não uma garantia de capacidade: 4K com muitos espectadores exige largura de banda e recursos consideráveis. Para dezenas/centenas de espectadores use **SFU** (LiveKit, mediasoup, Janus) ou ingestão de vídeo + **HLS/LL-HLS**.
- STUN público pode não alcançar conexões em NAT restrito. **TURN** é essencial para confiabilidade de acesso externo. O servidor não fornece TURN automaticamente.
- As salas vivem na memória deste processo Node.js e são perdidas ao reiniciá-lo. Não há login, chat, pagamentos, gravação ou CDN. Links de espectador podem ser compartilhados com qualquer pessoa que os possua.
- Este projeto é um **MVP funcional**, não uma plataforma de transmissão escalável pronta para produção sem infraestrutura adicional, segurança, métricas e testes.

## Publicar para espectadores em outros dispositivos

1. Instale Node.js 20+ em uma VPS, servidor ou computador acessível.
2. Execute `npm start`.
3. Configure HTTPS por domínio e proxy reverso (`Caddyfile.example`) **ou**, no Windows, utilize a nova instalação por IP público descrita no fim deste arquivo.
4. Se os usuários estiverem atrás de NATs restritivos, configure suas credenciais TURN com as variáveis acima.
5. Libere as portas do proxy HTTPS (443/TCP) e as portas UDP necessárias ao serviço TURN.

Você também pode gerar a imagem com `docker build -t liveforge .` e executá-la com `docker run -p 3000:3000 liveforge`. O Docker não dispensa HTTPS nem TURN.

## Organização

- `server.js`: servidor HTTP e sinalização WebRTC usando Server-Sent Events e POST (sem dependências de terceiros)
- `public/index.html`: interface de estúdio/espectador
- `public/styles.css`: aparência responsiva
- `public/app.js`: captura, negociação, codecs, qualidade adaptativa, UI e estatísticas

## Publicar pelo seu proprio IP publico, sem dominio (Windows + AX3000)

**`instalar.bat` permite tres modos:** [1] HTTPS (80/443 TCP), [2] somente HTTP na porta 3000 TCP (mais simples, menos seguro), [3] uso local. Tambem e possivel executar `instalar_local.bat` diretamente.

1. Extraia **todo** o ZIP em uma pasta normal, sem executar o BAT de dentro do ZIP.
2. Clique duas vezes em `instalar.bat` e escolha **[1] acesso publico HTTPS**.
3. Confirme a instalacao com permissao de administrador. O script `configurar_acesso_publico.ps1` tenta instalar Node.js LTS e Caddy usando **winget**, pede confirmacao do seu IPv4 publico, gera o Caddyfile e abre apenas TCP 80 e 443 no Firewall do Windows. O Caddy deve ser **2.11+**.
4. No AX3000, reserve o IP local do PC, depois encaminhe **TCP 80 -> PC:80** e **TCP 443 -> PC:443**. Veja `guia_roteador_AX3000.txt`.
5. Execute `iniciar_publico.bat` ou use o atalho **LiveForge Publico**. Mantenha **as duas janelas** (Node e Caddy) abertas.
6. Abra **http://localhost:3000** no computador transmissor, inicie a captura e copie o link `https://SEU_IP_PUBLICO/?watch=CODIGO` gerado para o amigo.
7. Peça a ele para abrir em outra conexao de internet, como **4G/5G**, e confirme no navegador que o certificado HTTPS foi emitido com sucesso (nao aceite avisos de certificado invalido).

**Certificado de IP confiavel:** desde janeiro de 2026, o Let's Encrypt permite certificados para IP publico com validade curta (aprox. 6 dias); o Caddy **2.11+** configurado com `issuer acme { profile shortlived }` solicita e renova automaticamente esses certificados. O IP WAN do roteador deve coincidir com o IP publico informado e as portas 80/443 precisam estar acessiveis da Internet. Nao ha certeza de emissao em redes com portas bloqueadas ou duplo NAT. **O instalador nao acessa nem modifica automaticamente o roteador.**

**Protecao:** neste modo, `server.js` escuta apenas em `127.0.0.1:3000` e a criacao de salas fica restrita a requisicoes locais no `localhost`. Caddy publica somente o frontend e as APIs necessarias a visualizacao/sinalizacao. Nao encaminhe a porta 3000. Para remover as regras de firewall ao parar de usar o projeto, remova manualmente as duas regras nomeadas `LiveForge Studio HTTPS TCP 80` e `LiveForge Studio HTTPS TCP 443` (ou use o script de remocao apos validar os comandos na sua maquina).

**Limites:** nao ha configuracao automatica de TURN, login ou moderacao. Com NAT restritivo pode haver site acessivel sem video WebRTC. A live usa upload de video separado para cada amigo. A operadora pode bloquear as portas 80/443 e seu IP pode mudar. O acesso a `localhost` no PC transmissor continua funcional mesmo antes da emissao do certificado; a URL publica depende de HTTPS com certificado valido. O comportamento nao foi validado num roteador ou Windows reais neste ambiente de criacao.


## Opcao [2] - Somente porta 3000 TCP (HTTP, sem dominio)

Essa opcao foi adicionada para quem deseja encaminhar **apenas TCP 3000** no roteador AX3000.

1. Descompacte o ZIP, execute `instalar.bat` e escolha **[2] Somente TCP 3000** (ou `instalar_porta_3000.bat`).
2. Aceite a permissao de administrador para instalar/verificar Node.js 20+ e liberar TCP 3000 no Firewall do Windows. Nenhuma instalacao do Caddy e necessaria nesse modo.
3. Informe/valide seu IPv4 publico; o script mostra IPs locais do computador. Confirme que o endereco WAN do roteador coincide com o IPv4 publico informado.
4. No AX3000, reserve o IPv4 local do PC e crie **uma unica regra: TCP 3000 externa -> TCP 3000 interna**, para o IP local do PC.
5. Execute `iniciar_porta_3000.bat` ou o atalho **LiveForge Porta 3000**. Nao execute simultaneamente o modo HTTPS/local, pois usam a mesma porta interna 3000.
6. **Voce compartilha a tela abrindo `http://localhost:3000` no seu proprio computador.** Essa origem local pode acessar `getDisplayMedia()`; a pagina HTTP pelo IP publico nao e um contexto seguro para iniciar a captura.
7. O link copiado pelo estúdio usa `http://SEU_IP_PUBLICO:3000/?watch=CODIGO` para o amigo assistir. Teste a partir de outra conexao (por exemplo, dados moveis).

**Restricoes importantes:** O site e sua sinalizacao via HTTP **nao tem HTTPS nem criptografia de transporte web**. Nao e recomendavel para publicacao permanente ou usuarios desconhecidos, pois intermediarios podem inspecionar ou adulterar a pagina e a sinalizacao. O WebRTC usa criptografia na midia peer-to-peer, mas nao resolve os riscos de HTTP. Use [1] HTTPS para uma publicacao mais segura. A criacao de salas fica restrita ao localhost no modo [2], mas nao substitui autenticacao e protecoes de producao.

**Conectividade de video:** encaminhar TCP 3000 permite acesso ao site e a sinalizacao. Conexoes WebRTC P2P negociam conectividade separadamente (normalmente por UDP atraves de STUN). Algumas redes exigem TURN. Uma unica porta nao e garantia de video em todas as redes.

**Se mudar de modo:** Pare as instancias antigas e retire os encaminhamentos nao utilizados do AX3000. Use `remover_regra_3000.bat` para apagar somente a regra de Firewall criada pelo modo [2]. Se o IP publico mudar, repita a instalacao [2] para atualizar o link. O programa nao altera as configuracoes do AX3000 automaticamente. Essa rotina nao foi executada em um computador Windows real neste ambiente.


## Novo em 1.1: Preferência de codificação e diagnóstico CPU/GPU

No painel **Codificação · CPU / GPU**, escolha:

- **Automático:** usa prioridade conservadora H.264/H.265 para manter compatibilidade e reduzir o risco de sobrecarga em GPUs antigas.
- **Preferir GPU:** coloca H.264/H.265 à frente (podem receber aceleração por hardware, conforme a máquina).
- **Preferir CPU:** coloca AV1/VP9 à frente (podem ser codificados por software, conforme a máquina).

**Limitação fundamental:** essas escolhas só mudam **a prioridade dos codecs WebRTC**, não selecionam o chip diretamente. Um navegador pode escolher GPU mesmo na preferência CPU e pode usar CPU mesmo na preferência GPU. A seleção manual de codec continua tendo prioridade sobre o perfil. Não existe uma API padrão amplamente suportada para forçar o encoder de WebRTC pelo JavaScript do site. O `hardwareAcceleration` do WebCodecs não controla automaticamente o pipeline WebRTC deste projeto.

O **Diagnóstico de codificação** lê `RTCRtpSender.getStats()` a cada 4 segundos, **quando pelo menos um espectador está conectado**, e mostra o codec realmente negociado, dimensões enviadas, FPS, tempo médio por quadro e `encoderImplementation`/`powerEfficientEncoder` se presentes. Só mostra **GPU** ou **CPU** como identificados se o navegador informar um nome de implementação reconhecível. Se não houver dados confiáveis, apresenta **Não identificado pelo navegador**; um indicador de eficiência energética isolado não prova aceleração de GPU. Para depurar, abra `chrome://webrtc-internals` no Chrome.

Para RX 580, teste primeiro **Preferir GPU + codec H.264**; comparar CPU e FPS do jogo com AV1 não garante que AV1 esteja sendo codificado pela CPU. Para **forçar** AMD AMF/NVIDIA NVENC/Intel Quick Sync ou encoder de CPU, uma versão futura precisaria de um componente nativo, como FFmpeg/GStreamer ou aplicativo desktop, com pipeline de transmissão integrado; este MVP continua 100% WebRTC pelo navegador.
