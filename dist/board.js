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
let labelCatalog = [];
let labelSettings = {showNames:true,patterns:false};
let boardName = 'Quadro de projetos';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if(Array.isArray(saved)) cards = saved;
  else if(saved) ({cards,columns,boardName,labelCatalog=[],labelSettings={showNames:true,patterns:false}} = saved);
} catch {}
const byId = id => document.getElementById(id);
const board = byId('board');
const editor = byId('editor');
const form = byId('form');
let editing = null;
let dragging = null;
let archivedView = false;
let checklist = [];
let selectedLabels = [];
let editingLabel = null;
const labelsDialog = byId('label-dialog');
const labelForm = byId('label-form');
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
const legacyLabels = card => (card.tag ?? '').split(',').map(label=>label.trim()).filter(Boolean);
const labelsFor = card => labelCatalog.filter(label=>card.labelIds.includes(label.id));
const labelColors = ['mint','blue','lilac','gold','pink'];
function labelColor(label){
  const normalized = label.toLocaleLowerCase('pt-BR');
  const knownColors = {design:'lilac',produto:'blue',operações:'mint',conteúdo:'pink'};
  const hash = Array.from(normalized).reduce((sum,letter)=>sum+letter.codePointAt(0),0);
  return Object.hasOwn(knownColors,normalized) ? knownColors[normalized] : labelColors[hash%labelColors.length];
}
const normalizeLabel = name => name.trim().toLocaleLowerCase('pt-BR');
function ensureLabel(name){
  const found = labelCatalog.find(label=>normalizeLabel(label.name)===normalizeLabel(name));
  if(found) return found.id;
  const label = {id:crypto.randomUUID(),name,color:labelColor(name)};
  labelCatalog.push(label);
  return label.id;
}
['Design','Produto','Operações','Conteúdo'].forEach(ensureLabel);
for(const card of cards){
  if(!card.labelIds) card.labelIds = [...new Set(legacyLabels(card).map(ensureLabel))];
}
function labelChip(label,showName=true){
  const chip = make('span','tag '+label.color+(labelSettings.patterns?' patterned':'')+(showName?'':' color-only'),showName ? label.name : '');
  if(!showName) chip.setAttribute('aria-label',label.name);
  chip.title = label.name;
  return chip;
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
    const visible = cards.filter(c=>Boolean(c.archived)===archivedView && c.column===column && (!filter || deadline(c)===filter) && [c.title,c.description,c.assignee ?? '',...labelsFor(c).map(label=>label.name)].some(value=>value.toLocaleLowerCase('pt-BR').includes(query)));
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
    recordActivity(card,card.completed ? 'concluiu o cartão' : 'reabriu o cartão');
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
  for(const label of labelsFor(card)) tags.append(labelChip(label,labelSettings.showNames));
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
  selectedLabels = [...(card?.labelIds ?? [])];
  renderSelectedLabels();
  showCardPanel(false);
  byId('diary-tab').hidden = !card;
  byId('diary-status').textContent = '';
  byId('comment').value = '';
  renderComments();
  byId('editor-context').textContent = boardName+' / '+columns.find(item=>item.id===column).name;
  for(const key of ['title','description','priority','date','start','assignee']){
    if(card) form.elements[key].value = card[key] ?? '';
  }
  byId('editor-title').textContent = card ? card.title : 'Novo cartão';
  byId('remove').hidden = !card;
  byId('remove').textContent = card?.archived ? 'Restaurar' : 'Arquivar';
  editor.showModal();
  (card ? byId('details-tab') : form.elements.title).focus();
}
function save(message){
  try { localStorage.setItem(storageKey,JSON.stringify({cards,columns,boardName,labelCatalog,labelSettings})); }
  catch { message += ' O navegador não conseguiu gravar as alterações.'; }
  render();
  byId('notice').textContent = message;
  return message;
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
  if(card.column!==column && card.column!==undefined){
    if(card.completed===false) delete card.completed;
    recordActivity(card,'moveu o cartão para '+columns.find(list=>list.id===column).name);
  }
  card.column = column;
}
function recordActivity(card,text){
  card.activity ??= [];
  card.activity.push({text,at:new Date().toISOString()});
}
function showCardPanel(diary){
  form.hidden = diary;
  byId('diary-panel').hidden = !diary;
  byId('details-tab').setAttribute('aria-pressed',String(!diary));
  byId('diary-tab').setAttribute('aria-pressed',String(diary));
}
byId('details-tab').onclick = ()=>showCardPanel(false);
byId('diary-tab').onclick = ()=>showCardPanel(true);
function renderComments(){
  const card = cards.find(item=>item.id===editing);
  const entries = [
    ...(card?.comments ?? []).map(item=>({...item,comment:true})),
    ...(card?.activity ?? [])
  ].reverse().sort((a,b)=>b.at.localeCompare(a.at));
  const feed = byId('comments');
  feed.replaceChildren(...entries.map(({text,at,comment})=>{
    const entry = make('article',comment ? 'diary-entry comment-entry' : 'diary-entry activity-entry');
    const avatar = make('span','diary-avatar',comment ? 'V' : '•');
    avatar.setAttribute('aria-hidden','true');
    const body = make('div');
    const meta = make('div','diary-meta');
    const time = make('time','',new Date(at).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}));
    time.dateTime = at;
    meta.append(make('strong','','Você'),time);
    body.append(meta,make('p','',text));
    entry.append(avatar,body);
    return entry;
  }));
  if(!entries.length) feed.append(make('p','empty','Nenhuma atualização neste cartão.'));
}
byId('comment-form').onsubmit = event=>{
  event.preventDefault();
  const input = byId('comment');
  const value = input.value.trim();
  const card = cards.find(item=>item.id===editing);
  if(!value || !card) return;
  card.comments ??= [];
  card.comments.push({text:value,at:new Date().toISOString()});
  input.value = '';
  renderComments();
  byId('diary-status').textContent = save('Comentário publicado.');
  byId('comments').scrollTop = 0;
  input.focus();
};
const colors = {mint:'Verde',blue:'Azul',lilac:'Roxo',gold:'Amarelo',pink:'Rosa',red:'Vermelho'};
function renderSelectedLabels(){
  const target = byId('selected-labels');
  target.replaceChildren(...labelCatalog.filter(label=>selectedLabels.includes(label.id)).map(label=>labelChip(label)));
  if(!target.childNodes.length) target.append(make('span','empty','Nenhuma etiqueta'));
}
function renderLabelOptions(){
  byId('show-label-names').checked = labelSettings.showNames;
  byId('label-patterns').checked = labelSettings.patterns;
  byId('label-options').replaceChildren(...labelCatalog.map(label=>{
    const row = make('div','label-option');
    const select = make('button','label-choice');
    select.type = 'button';
    select.setAttribute('aria-pressed',String(selectedLabels.includes(label.id)));
    select.append(labelChip(label),make('span','label-check',selectedLabels.includes(label.id) ? '✓' : ''));
    select.onclick = ()=>{
      selectedLabels = selectedLabels.includes(label.id) ? selectedLabels.filter(id=>id!==label.id) : [...selectedLabels,label.id];
      applySelectedLabels();
      byId('label-options').children[labelCatalog.indexOf(label)].firstElementChild.focus();
    };
    const edit = make('button','', 'Editar');
    edit.type = 'button';
    edit.setAttribute('aria-label','Editar etiqueta '+label.name);
    edit.onclick = ()=>openLabelForm(label);
    row.append(select,edit);
    return row;
  }));
}
function applySelectedLabels(){
  const card = cards.find(item=>item.id===editing);
  if(card) card.labelIds = [...selectedLabels];
  renderSelectedLabels();
  renderLabelOptions();
  save('Etiquetas atualizadas.');
}
function openLabelForm(label){
  editingLabel = label?.id ?? null;
  byId('label-form-title').textContent = label ? 'Editar etiqueta' : 'Nova etiqueta';
  byId('label-error').textContent = '';
  labelForm.elements.name.value = label?.name ?? '';
  byId('label-colors').replaceChildren(...Object.entries(colors).map(([color,name])=>{
    const option = make('label','tag '+color);
    const radio = make('input');
    radio.type = 'radio';
    radio.name = 'color';
    radio.value = color;
    radio.checked = color===(label?.color ?? 'mint');
    option.append(radio,make('span','',name));
    return option;
  }));
  labelForm.hidden = false;
  labelForm.elements.name.focus();
}
byId('manage-labels').onclick = ()=>{
  labelForm.hidden = true;
  renderLabelOptions();
  labelsDialog.showModal();
};
byId('close-labels').onclick = ()=>labelsDialog.close();
byId('new-label').onclick = ()=>openLabelForm(null);
byId('cancel-label').onclick = ()=>{
  labelForm.hidden = true;
  byId('new-label').focus();
};
for(const [id,key] of [['show-label-names','showNames'],['label-patterns','patterns']]){
  byId(id).onchange = event=>{
    labelSettings[key] = event.target.checked;
    applySelectedLabels();
  };
}
labelForm.onsubmit = event=>{
  event.preventDefault();
  const {name:rawName,color} = Object.fromEntries(new FormData(labelForm));
  const name = rawName.trim();
  if(!name) return;
  if(labelCatalog.some(label=>label.id!==editingLabel && normalizeLabel(label.name)===normalizeLabel(name))){
    byId('label-error').textContent = 'Já existe uma etiqueta com esse nome.';
    return;
  }
  if(editingLabel) Object.assign(labelCatalog.find(label=>label.id===editingLabel),{name,color});
  else {
    const id = crypto.randomUUID();
    labelCatalog.push({id,name,color});
    selectedLabels = [...selectedLabels,id];
  }
  labelForm.hidden = true;
  applySelectedLabels();
  byId('new-label').focus();
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
  recordActivity(card,card.archived ? 'arquivou o cartão' : 'restaurou o cartão');
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
  if(byId('check-item').value.trim()) addChecklistItem();
  const previous = cards.find(item=>item.id===editing);
  const card = {...previous,...fields,checklist,labelIds:selectedLabels,title:fields.title.trim(),column:previous?.column,id:editing ?? crypto.randomUUID()};
  moveCardTo(card,Number(fields.column));
  if(!previous) recordActivity(card,'criou o cartão');
  else if(previous.title!==card.title) recordActivity(card,'renomeou o cartão de “'+previous.title+'” para “'+card.title+'”');
  cards = editing ? cards.map(item=>item.id===editing ? card : item) : [...cards,card];
  editor.close();
  save(editing ? 'Cartão atualizado.' : 'Cartão criado.');
};
render();
