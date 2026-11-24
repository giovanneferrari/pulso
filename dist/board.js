const columns = [
  {name:'A fazer',color:'#8c6ad6'},
  {name:'Em andamento',color:'#3e76d7'},
  {name:'Em revisão',color:'#ba791d'},
  {name:'Concluído',color:'#25886c'}
];
const storageKey = 'pulso-board-v1';
const dateFormat = new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'short'});
const oneDay = 86400000;
const dateString = offset => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+offset)).toISOString().slice(0,10);
};
const seed = [
  ['Planejar a próxima sprint','Definir escopo e organizar as prioridades da equipe.','Produto','Alta',-2,0],
  ['Atualizar guia de marca','Reunir os novos componentes visuais.','Design','Normal',4,0],
  ['Organizar arquivos do projeto','','Operações','Normal',9,0],
  ['Prototipar painel de métricas','Explorar formas de visualizar os indicadores.','Design','Alta',1,1],
  ['Preparar calendário editorial','Estruturar as publicações do próximo mês.','Conteúdo','Normal',6,1],
  ['Revisar fluxo de cadastro','Validar o fluxo antes da publicação.','Produto','Normal',0,2],
  ['Definir checklist de lançamento','','Operações','Normal',-1,3],
  ['Consolidar feedback das entrevistas','','Produto','Normal',-4,3]
].map(([title,description,tag,priority,offset,column],index)=>({id:'sample-'+index,title,description,tag,priority,date:dateString(offset),column}));
let cards = seed;
try { cards = JSON.parse(localStorage.getItem(storageKey)) ?? seed; } catch {}
const byId = id => document.getElementById(id);
const board = byId('board');
const editor = byId('editor');
const form = byId('form');
let editing = null;
let dragging = null;
const deadline = card => {
  if(card.column === 3) return 'done';
  if(!card.date) return '';
  const days = (Date.parse(card.date)-Date.parse(dateString(0)))/oneDay;
  return days < 0 ? 'late' : days <= 3 ? 'soon' : '';
};
const make = (tag,className,text) => {
  const el = document.createElement(tag);
  if(className) el.className = className;
  if(text !== undefined) el.textContent = text;
  return el;
};
const dateLabel = card => {
  const formatted = dateFormat.format(new Date(card.date+'T12:00:00'));
  if(deadline(card)==='late') return 'Atrasado · '+formatted;
  if(deadline(card)==='done') return '✓ '+formatted;
  if(card.date===dateString(0)) return 'Vence hoje';
  if(card.date===dateString(1)) return 'Vence amanhã';
  return (deadline(card)==='soon' ? 'Vence ' : '')+formatted;
};
function render(){
  const summary = [
    ['','▤','Cartões',cards.length],
    ['late','!','Atrasados',cards.filter(c=>deadline(c)==='late').length],
    ['soon','◷','Vencem em breve',cards.filter(c=>deadline(c)==='soon').length],
    ['done','✓','Concluídos',cards.filter(c=>deadline(c)==='done').length]
  ];
  byId('stats').replaceChildren(...summary.map(([key,icon,label,count])=>{
    const stat = make('div','stat '+key);
    const symbol = make('span','symbol',icon);
    symbol.setAttribute('aria-hidden','true');
    const info = make('div');
    info.append(make('strong','',count),make('small','',label));
    stat.append(symbol,info);
    return stat;
  }));
  const query = byId('search').value.trim().toLocaleLowerCase('pt-BR');
  const filter = byId('filter').value;
  board.replaceChildren(...columns.map(({name,color},column)=>{
    const lane = make('section','lane');
    lane.dataset.column = column;
    const head = make('div','lane-head');
    const dot = make('span','dot');
    dot.style.setProperty('--dot',color);
    const visible = cards.filter(c=>c.column===column && (!filter || deadline(c)===filter) && [c.title,c.description,c.tag].some(value=>value.toLocaleLowerCase('pt-BR').includes(query)));
    head.append(dot,make('h3','',name),make('span','count',visible.length));
    const stack = make('div','cards');
    stack.append(...visible.map(cardElement));
    if(!visible.length) stack.append(make('p','empty',filter || query ? 'Nenhum resultado nesta coluna.' : 'Nenhum cartão.'));
    const add = make('button','add','＋ Adicionar cartão');
    add.setAttribute('aria-label','Adicionar cartão em '+name);
    add.onclick = ()=>openEditor(null,column);
    lane.append(head,stack,add);
    return lane;
  }));
}
function cardElement(card){
  const el = make('button','card');
  el.draggable = true;
  el.dataset.id = card.id;
  const tags = make('span','meta');
  if(card.tag) tags.append(make('span','tag '+card.tag.toLowerCase(),card.tag));
  if(card.priority==='Alta') tags.append(make('span','tag high','Prioridade alta'));
  if(tags.childNodes.length) el.append(tags);
  el.append(make('b','',card.title));
  if(card.description) el.append(make('span','description',card.description));
  if(card.date){
    const chips = make('span','meta chips');
    const date = make('time','deadline '+deadline(card),dateLabel(card));
    date.dateTime = card.date;
    chips.append(date);
    el.append(chips);
  }
  el.onclick = ()=>openEditor(card,card.column);
  return el;
}
function openEditor(card,column){
  editing = card?.id ?? null;
  form.reset();
  form.elements.column.value = column;
  for(const key of ['title','description','tag','priority','date']){
    if(card) form.elements[key].value = card[key];
  }
  byId('editor-title').textContent = card ? 'Editar cartão' : 'Novo cartão';
  byId('remove').hidden = !card;
  editor.showModal();
  form.elements.title.focus();
}
function save(message){
  try { localStorage.setItem(storageKey,JSON.stringify(cards)); }
  catch { message += ' O navegador não conseguiu gravar as alterações.'; }
  render();
  byId('notice').textContent = message;
}
function clearDrag(){
  board.querySelectorAll('.over,.drop-before').forEach(el=>el.classList.remove('over','drop-before'));
}
board.ondragstart = event => {
  const card = event.target.closest('.card');
  if(!card) return;
  dragging = card.dataset.id;
  event.dataTransfer.setData('text/plain',dragging);
  event.dataTransfer.effectAllowed = 'move';
};
board.ondragover = event => {
  const lane = event.target.closest('.lane');
  if(!dragging || !lane) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearDrag();
  lane.classList.add('over');
  const target = event.target.closest('.card');
  if(target && target.dataset.id!==dragging) target.classList.add('drop-before');
};
board.ondragleave = event => {
  if(!board.contains(event.relatedTarget)) clearDrag();
};
board.ondragend = () => { dragging = null; clearDrag(); };
board.ondrop = event => {
  const lane = event.target.closest('.lane');
  if(!dragging || !lane) return;
  event.preventDefault();
  const target = event.target.closest('.card')?.dataset.id;
  if(target === dragging) return;
  const card = cards.find(item=>item.id===dragging);
  if(!card) return;
  dragging = null;
  cards = cards.filter(item=>item.id!==card.id);
  card.column = Number(lane.dataset.column);
  const index = target ? cards.findIndex(item=>item.id===target) : cards.length;
  cards.splice(index,0,card);
  save('Cartão movido para '+columns[card.column].name+'.');
};
columns.forEach(({name},index)=>form.elements.column.add(new Option(name,index)));
byId('new').onclick = ()=>openEditor(null,0);
byId('search').oninput = render;
byId('filter').onchange = render;
byId('close').onclick = byId('cancel').onclick = ()=>editor.close();
byId('remove').onclick = ()=>{
  if(!window.confirm('Excluir este cartão?')) return;
  cards = cards.filter(card=>card.id!==editing);
  editor.close();
  save('Cartão excluído.');
};
form.onsubmit = event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  if(!fields.title.trim()){
    form.elements.title.focus();
    return;
  }
  const card = {...fields,title:fields.title.trim(),column:Number(fields.column),id:editing ?? crypto.randomUUID()};
  cards = editing ? cards.map(item=>item.id===editing ? card : item) : [...cards,card];
  editor.close();
  save(editing ? 'Cartão atualizado.' : 'Cartão criado.');
};
render();
