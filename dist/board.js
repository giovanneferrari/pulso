const initialColumns = [
  {name:'A fazer',color:'#8c6ad6'},
  {name:'Em andamento',color:'#3e76d7'},
  {name:'Em revisão',color:'#ba791d'},
  {name:'Concluído',color:'#25886c'}
].map((column,id)=>({...column,id,done:id===3}));
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
let columns = initialColumns;
let boardName = 'Quadro de projetos';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if(Array.isArray(saved)) cards = saved;
  else if(saved) ({cards,columns,boardName} = saved);
} catch {}
const byId = id => document.getElementById(id);
const board = byId('board');
const editor = byId('editor');
const form = byId('form');
let editing = null;
let dragging = null;
let archivedView = false;
let checklist = [];
let comments = [];
const nameDialog = byId('name-dialog');
const nameForm = byId('name-form');
let nameTarget = null;
const isComplete = card => card.completed ?? Boolean(columns.find(column=>column.id===card.column)?.done);
const deadline = card => {
  if(isComplete(card)) return 'done';
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
const formatDate = date => dateFormat.format(new Date(date+'T12:00:00'));
const labelsFor = card => (card.tag ?? '').split(',').map(label=>label.trim()).filter(Boolean);
const labelColors = ['mint','blue','lilac','gold','pink'];
function labelColor(label){
  const normalized = label.toLocaleLowerCase('pt-BR');
  const knownColors = {design:'lilac',produto:'blue',operações:'mint',conteúdo:'pink'};
  const hash = Array.from(normalized).reduce((sum,letter)=>sum+letter.codePointAt(0),0);
  return Object.hasOwn(knownColors,normalized) ? knownColors[normalized] : labelColors[hash%labelColors.length];
}
const dateLabel = card => {
  const formatted = formatDate(card.date);
  if(isComplete(card)) return 'Entrega '+formatted+' · Concluída';
  if(deadline(card)==='late') return 'Entrega '+formatted+' · Atrasada';
  if(card.date===dateString(0)) return 'Entrega '+formatted+' · Hoje';
  if(card.date===dateString(1)) return 'Entrega '+formatted+' · Amanhã';
  return 'Entrega '+formatted;
};
function render(){
  byId('board-title').textContent = boardName;
  const active = cards.filter(card=>!card.archived);
  const summary = [
    ['',active.length+' cartões'],
    ['late',active.filter(card=>deadline(card)==='late').length+' em atraso'],
    ['soon',active.filter(card=>deadline(card)==='soon').length+' vencem em breve']
  ];
  byId('stats').replaceChildren(...summary.map(([key,label])=>{
    const button = make('button','summary '+key,label);
    button.type = 'button';
    button.setAttribute('aria-pressed',String(byId('filter').value===key));
    button.onclick = ()=>{
      byId('filter').value = byId('filter').value===key ? '' : key;
      render();
    };
    return button;
  }));
  const query = byId('search').value.trim().toLocaleLowerCase('pt-BR');
  const filter = byId('filter').value;
  const previousScroll = board.scrollLeft;
  board.replaceChildren(...columns.map(({name,color,id:column})=>{

    const lane = make('section','lane');
    lane.dataset.column = column;
    const head = make('div','lane-head');
    const dot = make('span','dot');
    dot.style.setProperty('--dot',color);
    const visible = cards.filter(c=>Boolean(c.archived)===archivedView && c.column===column && (!filter || deadline(c)===filter) && [c.title,c.description,c.tag,c.assignee ?? ''].some(value=>value.toLocaleLowerCase('pt-BR').includes(query)));
    head.append(dot,make('h3','',name),make('span','count',visible.length));
    const menu = make('button','lane-menu','⋯');
    menu.setAttribute('aria-label','Configurar lista '+name);
    menu.onclick = ()=>openName(column);
    head.append(menu);
    const stack = make('div','cards');
    stack.append(...visible.map(cardElement));
    if(!visible.length) stack.append(make('p','empty',filter || query ? 'Nenhum resultado nesta coluna.' : 'Nenhum cartão.'));
    const add = make('button','add','＋ Adicionar cartão');
    add.setAttribute('aria-label','Adicionar cartão em '+name);
    add.onclick = ()=>openEditor(null,column);
    lane.append(head,stack);
    if(!archivedView) lane.append(add);
    return lane;
  }));
  if(!archivedView){
    const addList = make('button','add-list','＋ Adicionar lista');
    addList.onclick = ()=>openName('new');
    board.append(addList);
  }
  board.scrollLeft = previousScroll;
  const nav = byId('list-nav');
  nav.replaceChildren(...[...board.children].map((lane,index)=>{
    const name = columns[index]?.name ?? 'Adicionar lista';
    const button = make('button','list-jump');
    button.type = 'button';
    button.title = name;
    button.setAttribute('aria-label',name);
    button.onclick = ()=>lane.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
    return button;
  }));
  updateListNavigation();
}
function updateListNavigation(){
  const lanes = [...board.children];
  const start = board.getBoundingClientRect().left + parseFloat(getComputedStyle(board).paddingLeft);
  let closest = 0;
  lanes.forEach((lane,index)=>{
    if(Math.abs(lane.getBoundingClientRect().left-start)<Math.abs(lanes[closest].getBoundingClientRect().left-start)) closest = index;
  });
  [...byId('list-nav').children].forEach((button,index)=>button.setAttribute('aria-current',String(index===closest)));
}
board.addEventListener('scroll',updateListNavigation,{passive:true});
function cardElement(card){
  const el = make('article','card');
  el.draggable = !card.archived;
  el.dataset.id = card.id;
  const top = make('div','tile-top');
  const complete = make('button','complete',isComplete(card) ? '✓' : '');
  complete.type = 'button';
  complete.draggable = false;
  complete.setAttribute('aria-label','Conclusão de '+card.title);
  complete.setAttribute('aria-pressed',String(isComplete(card)));
  complete.onclick = ()=>{
    card.completed = !isComplete(card);
    save(card.completed ? 'Cartão concluído.' : 'Cartão reaberto.');
    board.querySelectorAll('.card').forEach(tile=>{
      if(tile.dataset.id===card.id) tile.querySelector('.complete').focus({preventScroll:true});
    });
  };
  const title = make('button','tile-title',card.title);
  title.type = 'button';
  title.draggable = false;
  title.onclick = ()=>openEditor(card,card.column);
  if(!card.archived) top.append(complete);
  top.append(title);
  el.append(top);
  const tags = make('div','meta tile-meta');
  for(const label of labelsFor(card)) tags.append(make('span','tag '+labelColor(label),label));
  if(card.priority==='Alta') tags.append(make('span','tag high','Prioridade alta'));
  if(tags.childNodes.length) el.append(tags);
  if(card.date || card.start){
    const dates = make('div','meta tile-meta');
    if(card.date){
      const date = make('time','deadline '+deadline(card),dateLabel(card));
      date.dateTime = card.date;
      dates.append(date);
    }
    if(card.start){
      const start = make('time','deadline start','Início '+formatDate(card.start));
      start.dateTime = card.start;
      dates.append(start);
    }
    el.append(dates);
  }
  const details = make('div','meta tile-meta');
  if(card.checklist?.length){
    const completed = card.checklist.filter(item=>item.done).length;
    details.append(make('span','info-chip','Checklist '+completed+'/'+card.checklist.length));
  }
  if(card.assignee) details.append(make('span','info-chip',card.assignee));
  if(card.comments?.length) details.append(make('span','info-chip',card.comments.length+' '+(card.comments.length===1?'comentário':'comentários')));
  if(details.childNodes.length) el.append(details);
  el.addEventListener('click',event=>{
    if(!event.target.closest('button')) openEditor(card,card.column);
  });
  return el;
}

function openEditor(card,column){
  editing = card?.id ?? null;
  form.reset();
  form.elements.column.replaceChildren(...columns.map(({name,id})=>new Option(name,id)));
  form.elements.column.value = column;
  checklist = (card?.checklist ?? []).map(item=>({...item}));
  byId('check-item').value = '';
  renderChecklist();
  comments = [...(card?.comments ?? [])];
  byId('comment').value = '';
  renderComments();
  byId('editor-context').textContent = boardName+' / '+columns.find(item=>item.id===column).name;
  for(const key of ['title','description','tag','priority','date','start','assignee']){
    if(card) form.elements[key].value = card[key] ?? '';
  }
  byId('editor-title').textContent = card ? 'Editar cartão' : 'Novo cartão';
  byId('remove').hidden = !card;
  byId('remove').textContent = card?.archived ? 'Restaurar' : 'Arquivar';
  editor.showModal();
  form.elements.title.focus();
}
function save(message){
  try { localStorage.setItem(storageKey,JSON.stringify({cards,columns,boardName})); }
  catch { message += ' O navegador não conseguiu gravar as alterações.'; }
  render();
  byId('notice').textContent = message;
}
function clearDrag(){
  board.querySelectorAll('.over,.drop-before').forEach(el=>el.classList.remove('over','drop-before'));
}
board.ondragstart = event => {
  const card = event.target.closest('.card');
  if(!card || card.draggable===false) return;
  dragging = card.dataset.id;
  event.dataTransfer.setData('text/plain',dragging);
  event.dataTransfer.effectAllowed = 'move';
};
board.ondragover = event => {
  const lane = event.target.closest('.lane');
  if(archivedView || !dragging || !lane) return;
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
  if(archivedView || !dragging || !lane) return;
  event.preventDefault();
  const target = event.target.closest('.card')?.dataset.id;
  if(target === dragging) return;
  const card = cards.find(item=>item.id===dragging);
  if(!card) return;
  dragging = null;
  cards = cards.filter(item=>item.id!==card.id);
  moveCardTo(card,Number(lane.dataset.column));
  const index = target ? cards.findIndex(item=>item.id===target) : cards.length;
  cards.splice(index,0,card);
  save('Cartão movido para '+columns.find(column=>column.id===card.column).name+'.');
};
function moveCardTo(card,column){
  if(card.column!==column && card.completed===false) delete card.completed;
  card.column = column;
}
function renderComments(){
  byId('comments').replaceChildren(...comments.map(comment=>{
    const entry = make('div','comment-entry');
    entry.append(make('p','',comment.text),make('small','',new Date(comment.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})));
    return entry;
  }));
}
function addComment(){
  const input = byId('comment');
  const value = input.value.trim();
  if(!value) return;
  comments.push({text:value,at:new Date().toISOString()});
  input.value = '';
  renderComments();
  input.focus();
}
byId('add-comment').onclick = addComment;
byId('comment').onkeydown = event=>{
  if(event.key!=='Enter') return;
  event.preventDefault();
  addComment();
};
function renderChecklist(){
  byId('checklist').replaceChildren(...checklist.map((item,index)=>{
    const line = make('div','check-line');
    const label = make('label','check-label');
    const check = make('input');
    check.type = 'checkbox';
    check.checked = item.done;
    check.onchange = ()=>{ item.done = check.checked; };
    label.append(check,make('span','',item.title));
    const remove = make('button','','×');
    remove.type = 'button';
    remove.setAttribute('aria-label','Remover item '+item.title);
    remove.onclick = ()=>{ checklist.splice(index,1); renderChecklist(); };
    line.append(label,remove);
    return line;
  }));
}
function addChecklistItem(){
  const input = byId('check-item');
  const title = input.value.trim();
  if(!title) return;
  checklist.push({title,done:false});
  input.value = '';
  renderChecklist();
  input.focus();
}
byId('add-item').onclick = addChecklistItem;
byId('check-item').onkeydown = event=>{
  if(event.key!=='Enter') return;
  event.preventDefault();
  addChecklistItem();
};
function openName(target){
  nameTarget = target;
  const index = columns.findIndex(column=>column.id===target);
  const column = columns[index];
  nameForm.reset();
  nameForm.elements.name.value = column?.name ?? (target==='board' ? boardName : '');
  nameForm.elements.done.checked = column?.done ?? false;
  byId('name-title').textContent = target==='board' ? 'Renomear quadro' : column ? 'Configurar lista' : 'Nova lista';
  byId('done-field').hidden = target==='board';
  byId('list-left').hidden = index<=0;
  byId('list-right').hidden = index<0 || index===columns.length-1;
  nameDialog.showModal();
  nameForm.elements.name.focus();
}
function moveList(offset){
  const index = columns.findIndex(column=>column.id===nameTarget);
  const [column] = columns.splice(index,1);
  columns.splice(index+offset,0,column);
  nameDialog.close();
  save('Lista movida.');
}
byId('list-left').onclick = ()=>moveList(-1);
byId('list-right').onclick = ()=>moveList(1);
byId('close-name').onclick = ()=>nameDialog.close();
byId('rename-board').onclick = ()=>openName('board');
nameForm.onsubmit = event=>{
  event.preventDefault();
  const name = nameForm.elements.name.value.trim();
  if(!name) return;
  const done = nameForm.elements.done.checked;
  if(nameTarget==='board') boardName = name;
  else if(nameTarget==='new'){
    const id = Math.max(...columns.map(column=>column.id))+1;
    columns.push({id,name,done,color:'#8c6ad6'});
  } else {
    const column = columns.find(item=>item.id===nameTarget);
    Object.assign(column,{name,done});
  }
  nameDialog.close();
  save('Alterações salvas.');
};
byId('archive-view').onclick = ()=>{
  archivedView = !archivedView;
  byId('archive-view').setAttribute('aria-pressed',String(archivedView));
  byId('archive-view').textContent = archivedView ? 'Voltar ao quadro' : 'Arquivo';
  byId('new').hidden = archivedView;
  byId('filter').value = '';
  render();
};
byId('new').onclick = ()=>openEditor(null,columns[0].id);
byId('search').oninput = render;
byId('filter').onchange = render;
byId('close').onclick = byId('cancel').onclick = ()=>editor.close();
byId('remove').onclick = ()=>{
  const card = cards.find(item=>item.id===editing);
  card.archived = !card.archived;
  editor.close();
  save(card.archived ? 'Cartão arquivado.' : 'Cartão restaurado.');

};
form.onsubmit = event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  if(!fields.title.trim()){
    form.elements.title.focus();
    return;
  }
  if(byId('comment').value.trim()) addComment();
  if(byId('check-item').value.trim()) addChecklistItem();
  const previous = cards.find(item=>item.id===editing);
  const card = {...previous,...fields,checklist,comments,title:fields.title.trim(),column:previous?.column,id:editing ?? crypto.randomUUID()};
  moveCardTo(card,Number(fields.column));
  cards = editing ? cards.map(item=>item.id===editing ? card : item) : [...cards,card];
  editor.close();
  save(editing ? 'Cartão atualizado.' : 'Cartão criado.');
};
render();
