let clients = [];
let selectedClientId = null;
let editingClientId = null;
let socket = null;
let currentMenu = 'tcp';

const tools = [
  { id: 1, name: 'pdf合并' },
  // { id: 2, name: '工具2' },
  // { id: 3, name: '工具3' }
];

let pdfFiles = [];
const MAX_PDF_FILES = 10;
let lastMergedPdfBytes = null;
let lastMergedFileName = '';

const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

let configPath = '';

const menuItems = document.querySelectorAll('.menu-item');
const clientListPanel = document.getElementById('clientListPanel');
const toolsListPanel = document.getElementById('toolsListPanel');
const tcpContent = document.getElementById('tcpContent');
const toolsContent = document.getElementById('toolsContent');
const toolsList = document.getElementById('toolsList');

const pdfMergeContainer = document.getElementById('pdfMergeContainer');
const toolEmpty = document.getElementById('toolEmpty');
const pdfFileList = document.getElementById('pdfFileList');
const btnAddPdf = document.getElementById('btnAddPdf');
const btnMerge = document.getElementById('btnMerge');
const pdfResult = document.getElementById('pdfResult');

const clientList = document.getElementById('clientList');
const btnAdd = document.getElementById('btnAdd');
const btnRemove = document.getElementById('btnRemove');
const addModal = document.getElementById('addModal');
const deleteModal = document.getElementById('deleteModal');
const closeAddModal = document.getElementById('closeAddModal');
const closeDeleteModal = document.getElementById('closeDeleteModal');
const btnCancel = document.getElementById('btnCancel');
const btnSave = document.getElementById('btnSave');
const btnDeleteCancel = document.getElementById('btnDeleteCancel');
const btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
const inputRemark = document.getElementById('inputRemark');
const inputHost = document.getElementById('inputHost');
const inputPort = document.getElementById('inputPort');
const deleteMessage = document.getElementById('deleteMessage');
const currentClient = document.getElementById('currentClient');
const chatContent = document.getElementById('chatContent');
const hexInput = document.getElementById('hexInput');
const hexDisplay = document.getElementById('hexDisplay');
const btnSend = document.getElementById('btnSend');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnEdit = document.getElementById('btnEdit');
const btnConnect = document.getElementById('btnConnect');
const btnClear = document.getElementById('btnClear');

async function loadClients() {
  try {
    const userDataPath = await ipcRenderer.invoke('get-user-data-path');
    configPath = path.join(userDataPath, 'tcp_clients.json');
    
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      clients = JSON.parse(data);
    } else {
      clients = [];
    }
  } catch (err) {
    console.error('加载客户端配置失败:', err);
    clients = [];
  }
}

function saveClients() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(clients, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存客户端配置失败:', err);
  }
}

function renderClients() {
  clientList.innerHTML = '';
  clients.forEach(client => {
    const item = document.createElement('div');
    item.className = `client-item ${client.id === selectedClientId ? 'selected' : ''}`;
    item.dataset.id = client.id;
    item.innerHTML = `
      <div class="client-item-remark">${client.remark}</div>
      <div class="client-item-address">${client.host}:${client.port}</div>
    `;
    item.addEventListener('click', () => selectClient(client.id));
    clientList.appendChild(item);
  });
}

function renderTools() {
  toolsList.innerHTML = '';
  tools.forEach(tool => {
    const item = document.createElement('div');
    item.className = 'tool-item';
    item.dataset.id = tool.id;
    item.innerHTML = `
      <div class="tool-item-name">${tool.name}</div>
    `;
    item.addEventListener('click', () => selectTool(tool.id));
    toolsList.appendChild(item);
  });
}

function selectTool(toolId) {
  document.querySelectorAll('.tool-item').forEach(item => {
    item.classList.remove('selected');
    if (parseInt(item.dataset.id) === toolId) {
      item.classList.add('selected');
    }
  });

  if (toolId === 1) {
    pdfMergeContainer.style.display = 'flex';
    toolEmpty.style.display = 'none';
  } else {
    pdfMergeContainer.style.display = 'none';
    toolEmpty.style.display = 'flex';
  }
}

function renderPdfFiles() {
  pdfFileList.innerHTML = '';
  pdfFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'pdf-file-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'pdf-file-name';
    nameSpan.textContent = file.name;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-pdf';
    removeBtn.textContent = '删除';
    removeBtn.addEventListener('click', () => removePdfFile(index));
    
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);
    pdfFileList.appendChild(item);
  });
  updateAddPdfButton();
}

function updateAddPdfButton() {
  if (pdfFiles.length >= MAX_PDF_FILES) {
    btnAddPdf.classList.add('hidden');
  } else {
    btnAddPdf.classList.remove('hidden');
  }
}

function removePdfFile(index) {
  pdfFiles.splice(index, 1);
  renderPdfFiles();
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  
  files.forEach(file => {
    if (file.type === 'application/pdf' && pdfFiles.length < MAX_PDF_FILES) {
      pdfFiles.push(file);
    }
  });
  
  renderPdfFiles();
  event.target.remove();
}

async function mergePdfs() {
  if (pdfFiles.length < 2) {
    alert('请至少选择2个PDF文件');
    return;
  }

  btnMerge.disabled = true;
  pdfResult.innerHTML = `
    <div class="pdf-result-loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">合并中...</div>
    </div>
  `;

  try {
    const { PDFDocument } = require('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    for (const file of pdfFiles) {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes);
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    lastMergedPdfBytes = await mergedPdf.save();
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomStr = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    lastMergedFileName = `${dateStr}${randomStr}.pdf`;

    const successDiv = document.createElement('div');
    successDiv.className = 'pdf-result-success';
    
    const fileNameDiv = document.createElement('div');
    fileNameDiv.className = 'pdf-file-name-result';
    fileNameDiv.textContent = lastMergedFileName;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download';
    downloadBtn.textContent = '下载';
    downloadBtn.addEventListener('click', downloadPdf);
    
    successDiv.appendChild(fileNameDiv);
    successDiv.appendChild(downloadBtn);
    pdfResult.innerHTML = '';
    pdfResult.appendChild(successDiv);

  } catch (error) {
    console.error('合并失败:', error);
    pdfResult.innerHTML = `
      <div class="pdf-result-empty">合并失败: ${error.message}</div>
    `;
  } finally {
    btnMerge.disabled = false;
  }
}

function downloadPdf() {
  if (!lastMergedPdfBytes) {
    return;
  }
  
  const blob = new Blob([lastMergedPdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lastMergedFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function switchMenu(menu) {
  currentMenu = menu;
  
  menuItems.forEach(item => {
    if (item.dataset.menu === menu) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  if (menu === 'tcp') {
    clientListPanel.style.display = 'flex';
    toolsListPanel.style.display = 'none';
    tcpContent.style.display = 'flex';
    toolsContent.style.display = 'none';
  } else {
    clientListPanel.style.display = 'none';
    toolsListPanel.style.display = 'flex';
    tcpContent.style.display = 'none';
    toolsContent.style.display = 'flex';
    pdfMergeContainer.style.display = 'none';
    toolEmpty.style.display = 'flex';
  }
}

function renderMessages(client) {
  chatContent.innerHTML = '';
  if (client && client.messages) {
    client.messages.forEach(msg => {
      const messageItem = document.createElement('div');
      messageItem.className = `message-item ${msg.type}`;
      messageItem.innerHTML = `
        <div class="message-time">${msg.type === 'send' ? '发送' : '接收'} ${msg.time}</div>
        <div class="message-content">${msg.content}</div>
      `;
      chatContent.appendChild(messageItem);
    });
    chatContent.scrollTop = chatContent.scrollHeight;
  }
}

function updateConnectionStatus(isConnected) {
  if (isConnected) {
    statusDot.classList.remove('offline');
    statusDot.classList.add('online');
    statusText.textContent = '已连接';
    btnConnect.textContent = '断开连接';
    btnConnect.classList.add('disconnect');
  } else {
    statusDot.classList.remove('online');
    statusDot.classList.add('offline');
    statusText.textContent = '未连接';
    btnConnect.textContent = '连接';
    btnConnect.classList.remove('disconnect');
  }
}

function selectClient(id) {
  if (socket) {
    socket.destroy();
    socket = null;
    updateConnectionStatus(false);
  }

  selectedClientId = id;
  renderClients();
  const client = clients.find(c => c.id === id);
  if (client) {
    currentClient.textContent = `${client.remark} (${client.host}:${client.port})`;
    renderMessages(client);
  } else {
    currentClient.textContent = '未选择';
    chatContent.innerHTML = '';
  }
}

function openAddModal() {
  editingClientId = null;
  inputRemark.value = '';
  inputHost.value = '';
  inputPort.value = '';
  document.querySelector('.modal-title').textContent = '添加配置';
  addModal.classList.add('active');
}

function openEditModal() {
  if (!selectedClientId) {
    return;
  }
  const client = clients.find(c => c.id === selectedClientId);
  if (client) {
    editingClientId = selectedClientId;
    inputRemark.value = client.remark;
    inputHost.value = client.host;
    inputPort.value = client.port;
    document.querySelector('.modal-title').textContent = '编辑配置';
    addModal.classList.add('active');
  }
}

function closeAddModalFunc() {
  addModal.classList.remove('active');
}

function openDeleteModal() {
  if (!selectedClientId) {
    return;
  }
  const client = clients.find(c => c.id === selectedClientId);
  if (client) {
    deleteMessage.textContent = `确定要删除${client.remark}客户端吗？`;
  }
  deleteModal.classList.add('active');
}

function closeDeleteModalFunc() {
  deleteModal.classList.remove('active');
}

function saveClient() {
  const remark = inputRemark.value.trim();
  const host = inputHost.value.trim();
  const port = inputPort.value.trim();

  if (!remark || !host || !port) {
    return;
  }

  if (editingClientId) {
    const client = clients.find(c => c.id === editingClientId);
    if (client) {
      client.remark = remark;
      client.host = host;
      client.port = port;
      if (selectedClientId === editingClientId) {
        currentClient.textContent = `${client.remark} (${client.host}:${client.port})`;
      }
    }
  } else {
    const newClient = {
      id: Date.now(),
      remark,
      host,
      port,
      messages: []
    };
    clients.push(newClient);
  }

  saveClients();
  renderClients();
  closeAddModalFunc();
}

function deleteClient() {
  if (!selectedClientId) {
    return;
  }

  if (socket) {
    socket.destroy();
    socket = null;
    updateConnectionStatus(false);
  }

  clients = clients.filter(client => client.id !== selectedClientId);
  selectedClientId = null;
  currentClient.textContent = '未选择';
  chatContent.innerHTML = '';
  saveClients();
  renderClients();
  closeDeleteModalFunc();
}

function connectTcp() {
  if (!selectedClientId) {
    return;
  }

  if (socket) {
    socket.destroy();
    socket = null;
    updateConnectionStatus(false);
    return;
  }

  const client = clients.find(c => c.id === selectedClientId);
  if (!client) {
    return;
  }

  const net = require('net');
  socket = new net.Socket();

  socket.connect(client.port, client.host, () => {
    updateConnectionStatus(true);
    addMessage('连接成功', 'receive');
  });

  socket.on('data', (data) => {
    const hexStr = data.toString('hex').toUpperCase();
    const formatted = hexStr.match(/.{1,2}/g).join(' ');
    addMessage(formatted, 'receive');
  });

  socket.on('close', () => {
    socket = null;
    updateConnectionStatus(false);
    addMessage('连接已断开', 'receive');
  });

  socket.on('error', (err) => {
    socket = null;
    updateConnectionStatus(false);
    addMessage(`连接错误: ${err.message}`, 'receive');
  });
}

function clearMessages() {
  if (!selectedClientId) {
    return;
  }
  const client = clients.find(c => c.id === selectedClientId);
  if (client) {
    client.messages = [];
    chatContent.innerHTML = '';
    saveClients();
  }
}

function formatHex(input) {
  const hex = input.replace(/[^0-9a-fA-F]/g, '');
  const pairs = hex.match(/.{1,2}/g) || [];
  return pairs.join(' ').toUpperCase();
}

function handleHexInput() {
  const displayText = formatHex(hexInput.value);
  hexDisplay.textContent = displayText || '等待输入...';
}

function addMessage(content, type) {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  
  const client = clients.find(c => c.id === selectedClientId);
  if (client) {
    if (!client.messages) {
      client.messages = [];
    }
    client.messages.push({
      content,
      type,
      time: timeStr
    });
    saveClients();
  }
  
  const messageItem = document.createElement('div');
  messageItem.className = `message-item ${type}`;
  messageItem.innerHTML = `
    <div class="message-time">${type === 'send' ? '发送' : '接收'} ${timeStr}</div>
    <div class="message-content">${content}</div>
  `;
  
  chatContent.appendChild(messageItem);
  chatContent.scrollTop = chatContent.scrollHeight;
}

function sendMessage() {
  const hexValue = hexInput.value.replace(/[^0-9a-fA-F]/g, '');
  if (!hexValue) {
    return;
  }

  if (!socket) {
    addMessage('请先连接服务器', 'receive');
    return;
  }
  
  const formatted = formatHex(hexValue);
  addMessage(formatted, 'send');

  const buffer = Buffer.from(hexValue, 'hex');
  socket.write(buffer);
  
  hexInput.value = '';
  hexDisplay.textContent = '等待输入...';
}

loadClients().then(() => {
  renderClients();
  renderTools();
  switchMenu('tcp');
});

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    switchMenu(item.dataset.menu);
  });
});

btnAdd.addEventListener('click', openAddModal);
btnRemove.addEventListener('click', openDeleteModal);
closeAddModal.addEventListener('click', closeAddModalFunc);
closeDeleteModal.addEventListener('click', closeDeleteModalFunc);
btnCancel.addEventListener('click', closeAddModalFunc);
btnSave.addEventListener('click', saveClient);
btnDeleteCancel.addEventListener('click', closeDeleteModalFunc);
btnDeleteConfirm.addEventListener('click', deleteClient);
hexInput.addEventListener('input', handleHexInput);
btnSend.addEventListener('click', sendMessage);
btnEdit.addEventListener('click', openEditModal);
btnConnect.addEventListener('click', connectTcp);
btnClear.addEventListener('click', clearMessages);

btnAddPdf.addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', handleFileSelect);
  document.body.appendChild(fileInput);
  fileInput.click();
});
btnMerge.addEventListener('click', mergePdfs);