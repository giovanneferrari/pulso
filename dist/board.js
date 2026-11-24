import {connect, signIn, signOut, loadBoard, persistBoard} from './cloud.js';

const initialColumns = [
  {name:'A fazer',color:'#8c6ad6'},
  {name:'Em andamento',color:'#3e76d7'},
  {name:'Em revisão',color:'#ba791d'},
  {name:'Concluído',color:'#25886c'}
].map((column,id)=>({...column,id,done:id===3}));
const dateFormat = new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'short'});
const dateString = offset => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+offset)).toISOString().slice(0,10);
};
let cards = [];
let columns = initialColumns;
let labelCatalog = [];
let labelSettings = {showNames:true,patterns:false};
let boardName = 'Quadro de projetos';
const byId = id => document.getElementById(id);
const board = byId('board');
const editor = byId('editor');
const form = byId('form');
let editing = null;
let dragging = null;
let archivedView = false;
let deadlineFilter = '';
let checklist = [];
let selectedLabels = [];
let editingLabel = null;
const labelsDialog = byId('label-dialog');
const labelForm = byId('label-form');
const nameDialog = byId('name-dialog');
const nameForm = byId('name-form');
let nameTarget = null;
const isComplete = card => card.completed ?? Boolean(columns.find(column=>column.id===card.column)?.done);
function deadline(card,today=dateString(0)){
  if(isComplete(card) || !card.date) return '';
  if(card.date<today) return 'late';
  return card.date===today ? 'today' : 'future';
}
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
function restoreBoard(snapshot){
  if(snapshot) ({cards,columns,boardName,labelCatalog=[],labelSettings={showNames:true,patterns:false}} = snapshot);
  ['Design','Produto','Operações','Conteúdo'].forEach(ensureLabel);
  for(const card of cards){
    if(!card.labelIds) card.labelIds = [...new Set(legacyLabels(card).map(ensureLabel))];
  }
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
function compareDueDates(a,b){
  if(a.date===b.date) return 0;
  if(!a.date) return b.date ? 1 : 0;
  if(!b.date) return -1;
  return a.date.localeCompare(b.date);
}
function render(){
  byId('board-title').textContent = boardName;
  const tagFilter = byId('tag-filter');
  const selectedTag = tagFilter.value;
  const sortedLabels = [...labelCatalog].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  tagFilter.replaceChildren(new Option('Todas as etiquetas',''),...sortedLabels.map(label=>new Option(label.name,label.id)));
  tagFilter.value = labelCatalog.some(label=>label.id===selectedTag) ? selectedTag : '';
  const tag = tagFilter.value;
  const query = byId('search').value.trim().toLocaleLowerCase('pt-BR');
  const today = dateString(0);
  const counts = {late:0,today:0,future:0};
  const viewCards = cards.filter(card=>{
    if(Boolean(card.archived)!==archivedView || (tag && !card.labelIds.includes(tag))) return false;
    if(!query) return true;
    const fields = [card.title,card.description,card.assignee ?? '',...labelsFor(card).map(label=>label.name)];
    return fields.some(value=>value.toLocaleLowerCase('pt-BR').includes(query));
  });
  for(const card of viewCards){
    const status = deadline(card,today);
    if(status) counts[status]++;
  }
  for(const button of byId('stats').querySelectorAll('button')){
    const key = button.dataset.deadline;
    button.setAttribute('aria-pressed',String(deadlineFilter===key));
    button.querySelector('span').textContent = key ? counts[key] : viewCards.length;
  }
  const visibleCards = deadlineFilter ? viewCards.filter(card=>deadline(card,today)===deadlineFilter) : viewCards;
  const previousScroll = board.scrollLeft;
  board.replaceChildren(...columns.map(({name,color,id:column})=>{

    const lane = make('section','lane');
    lane.dataset.column = column;
    const head = make('div','lane-head');
    const dot = make('span','dot');
    dot.style.setProperty('--dot',color);
    const visible = visibleCards.filter(card=>card.column===column);
    visible.sort(compareDueDates);
    const heading = make('h3');
    const rename = make('button','lane-title',name);
    rename.type = 'button';
    rename.setAttribute('aria-label','Renomear lista '+name);
    rename.onclick = ()=>openName(column,true);
    heading.append(rename);
    head.append(dot,heading,make('span','count',visible.length));
    const menu = make('button','lane-menu','⋯');
    menu.setAttribute('aria-label','Configurar lista '+name);
    menu.onclick = ()=>openName(column);
    head.append(menu);
    const stack = make('div','cards');
    stack.append(...visible.map(cardElement));
    if(!visible.length) stack.append(make('p','empty',deadlineFilter || query || tag ? 'Nenhum resultado nesta coluna.' : 'Nenhum cartão.'));
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
  for(const label of labelsFor(card)) tags.append(labelChip(label,labelSettings.showNames));
  if(tags.childNodes.length) el.append(tags);
  if(card.date || card.start){
    const dates = make('div','meta tile-meta');
    if(card.date){
      const today = dateString(0);
      const highlight = card.date < today ? ' late' : card.date === today ? ' today' : '';
      const date = make('time','deadline'+highlight,dateLabel(card));
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
  byId('delete-card').hidden = !card?.archived;
  byId('remove').textContent = card?.archived ? 'Restaurar' : 'Arquivar';
  editor.showModal();
  (card ? byId('details-tab') : form.elements.title).focus();
}
function save(message){
  const snapshot = structuredClone({cards,columns,boardName,labelCatalog,labelSettings});
  const notice = byId('notice');
  notice.textContent = 'Salvando…';
  render();
  persistBoard(snapshot).then(()=>{
    notice.textContent = message;
    if(editor.open) byId('diary-status').textContent = message;
  }).catch(error=>{
    notice.textContent = error.message;
    if(editor.open) byId('diary-status').textContent = error.message;
  });
  return 'Salvando…';
}
function clearDrag(){
  board.querySelectorAll('.lane.over').forEach(lane=>lane.classList.remove('over'));
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
  clearDrag();
  const card = cards.find(item=>item.id===dragging);
  if(!card || card.column===Number(lane.dataset.column)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  lane.classList.add('over');
};
board.ondragleave = event => {
  if(!board.contains(event.relatedTarget)) clearDrag();
};
board.ondragend = () => { dragging = null; clearDrag(); };
board.ondrop = event => {
  const lane = event.target.closest('.lane');
  if(archivedView || !dragging || !lane) return;
  event.preventDefault();
  const card = cards.find(item=>item.id===dragging);
  const column = Number(lane.dataset.column);
  if(!card || card.column===column) return;
  dragging = null;
  moveCardTo(card,column);
  save('Cartão movido para '+columns.find(column=>column.id===card.column).name+'.');
};
function moveCardTo(card,column){
  if(card.column!==column && card.column!==undefined && card.completed===false) delete card.completed;
  card.column = column;
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
    ...(card?.activity ?? []).filter(item=>item.text==='criou o cartão')
  ].reverse().sort((a,b)=>b.at.localeCompare(a.at));
  const feed = byId('comments');
  feed.replaceChildren(...entries.map(({text,at,comment})=>{
    const entry = make('article',comment ? 'diary-entry comment-entry' : 'diary-entry activity-entry');
    const avatar = make('span','diary-avatar',comment ? 'V' : '•');
    avatar.setAttribute('aria-hidden','true');
    const body = make('div');
    const meta = make('div','diary-meta');
    const timestamp = new Date(at);
    const date = timestamp.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const hour = timestamp.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const time = make('time','',date+' às '+hour);
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
function openName(target,renameOnly=false){
  nameTarget = target;
  const index = columns.findIndex(column=>column.id===target);
  const column = columns[index];
  nameForm.reset();
  nameForm.elements.name.value = column?.name ?? (target==='board' ? boardName : '');
  nameForm.elements.done.checked = column?.done ?? false;
  byId('name-title').textContent = target==='board' ? 'Renomear quadro' : column ? (renameOnly ? 'Renomear lista' : 'Configurar lista') : 'Nova lista';
  byId('done-field').hidden = renameOnly || target==='board';
  byId('list-left').hidden = renameOnly || index<=0;
  byId('list-right').hidden = renameOnly || index<0 || index===columns.length-1;
  const deleteList = byId('delete-list');
  deleteList.hidden = renameOnly || !column;
  deleteList.disabled = columns.length<=1;
  deleteList.title = deleteList.disabled ? 'O quadro precisa ter pelo menos uma lista.' : '';
  nameDialog.showModal();
  nameForm.elements.name.focus();
  if(renameOnly) nameForm.elements.name.select();
}
function moveList(offset){
  const index = columns.findIndex(column=>column.id===nameTarget);
  const [column] = columns.splice(index,1);
  columns.splice(index+offset,0,column);
  nameDialog.close();
  save('Lista movida.');
}
const deleteListDialog = byId('delete-list-dialog');
const deleteListForm = byId('delete-list-form');
byId('delete-list').onclick = ()=>{
  const column = columns.find(item=>item.id===nameTarget);
  if(!column || columns.length<=1) return;
  const count = cards.filter(card=>card.column===column.id).length;
  const destination = deleteListForm.elements.destination;
  destination.replaceChildren(
    new Option('Escolha uma lista',''),
    ...columns.filter(item=>item.id!==column.id).map(item=>new Option(item.name,item.id))
  );
  destination.required = count>0;
  byId('destination-field').hidden = count===0;
  byId('delete-list-description').textContent = 'Excluir “'+column.name+'”?'+(count ? ' Escolha o destino dos cartões, incluindo os arquivados.' : '');
  deleteListDialog.showModal();
};
byId('cancel-delete-list').onclick = ()=>deleteListDialog.close();
deleteListForm.onsubmit = event=>{
  event.preventDefault();
  const remaining = columns.filter(column=>column.id!==nameTarget);
  if(!remaining.length || remaining.length===columns.length) return;
  const affected = cards.filter(card=>card.column===nameTarget);
  const destination = deleteListForm.elements.destination.value;
  if(affected.length){
    if(!destination || !remaining.some(column=>column.id===Number(destination))) return;
    for(const card of affected) moveCardTo(card,Number(destination));
  }
  columns = remaining;
  deleteListDialog.close();
  nameDialog.close();
  save('Lista excluída.');
};
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
  deadlineFilter = '';
  render();
};
byId('new').onclick = ()=>openEditor(null,columns[0].id);
byId('search').oninput = render;
for(const button of byId('stats').querySelectorAll('button')){
  button.onclick = ()=>{
    deadlineFilter = button.dataset.deadline;
    render();
  };
}
byId('tag-filter').onchange = render;
const density = byId('card-density');
const densityKey = 'pulso-card-density';
try {
  const preferred = localStorage.getItem(densityKey);
  if(Array.from(density.options).some(option=>option.value===preferred)) density.value = preferred;
} catch {}
board.dataset.density = density.value;
density.onchange = ()=>{
  board.dataset.density = density.value;
  try { localStorage.setItem(densityKey,density.value); } catch {}
};
byId('close').onclick = byId('cancel').onclick = ()=>editor.close();
byId('remove').onclick = ()=>{
  const card = cards.find(item=>item.id===editing);
  card.archived = !card.archived;
  editor.close();
  save(card.archived ? 'Cartão arquivado.' : 'Cartão restaurado.');

};
byId('delete-card').onclick = ()=>{
  const card = cards.find(item=>item.id===editing);
  if(!card?.archived || !window.confirm('Excluir “'+card.title+'” permanentemente?')) return;
  cards = cards.filter(item=>item.id!==card.id);
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
  if(byId('check-item').value.trim()) addChecklistItem();
  const previous = cards.find(item=>item.id===editing);
  const card = {...previous,...fields,checklist,labelIds:selectedLabels,title:fields.title.trim(),column:previous?.column,id:editing ?? crypto.randomUUID()};
  moveCardTo(card,Number(fields.column));
  if(!previous) card.activity = [{text:'criou o cartão',at:new Date().toISOString()}];
  cards = editing ? cards.map(item=>item.id===editing ? card : item) : [...cards,card];
  editor.close();
  save(editing ? 'Cartão atualizado.' : 'Cartão criado.');
};
const loginStatus = byId('login-status');
const loginSubmit = byId('login-submit');
async function enter(user){
  restoreBoard(await loadBoard(user));
  byId('login-panel').hidden = true;
  byId('app').hidden = false;
  render();
}
byId('login-form').onsubmit = async event=>{
  event.preventDefault();
  loginSubmit.disabled = true;
  loginStatus.textContent = 'Entrando…';
  const {email,password} = event.currentTarget.elements;
  try {
    const user = await signIn(email.value.trim(),password.value);
    password.value = '';
    await enter(user);
  } catch(error) {
    loginStatus.textContent = error.status===400 ? 'Confira o e-mail e a senha.' : 'Não foi possível entrar. Tente novamente.';
  } finally {
    loginSubmit.disabled = false;
  }
};
byId('logout').onclick = async ()=>{
  try { await signOut(); location.reload(); }
  catch { byId('notice').textContent = 'Não foi possível sair. Tente novamente.'; }
};
connect().then(async user=>{
  if(user) await enter(user);
  loginStatus.textContent = '';
  loginSubmit.disabled = false;
}).catch(()=>{
  loginStatus.textContent = 'Não foi possível conectar ao Supabase.';
});
