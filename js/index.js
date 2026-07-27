let clients = [];
let selectedClientId = null;
let editingClientId = null;
let socket = null;

const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

let configPath = '';

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