from tkinter import *
import os

'''
Start  : 2017.08.20
Update : 2018.05.13a
'''

class ChoboFileManaer(Frame):
    def on_cmd(self):
        print ("run command")
        os.system("start cmd")

    def on_runexe(self, exefile):
        print ("run " + exefile)
        os.system("start " + exefile)

    def on_runPython(sefl, pythonFile):
        print ("run python " + pythonFile)
        os.system("start python " + pythonFile)

    def on_runexplorer(self):
        print ("run explorer : " + self.currDir)
        os.system("explorer " + self.currDir)

    def on_runtxt(self, txtfile):
        print ("run " + txtfile)
        os.system("start notepad " + txtfile)

    def on_Paint(self):
        print ("run command")
        os.system("start mspaint")

    def on_Note(self):
        print ("run command")
        os.system("start notepad")

    def on_runcmd_delete(self):
        print ("on_runcmd_delete")
        self.cmdbox.delete(0,END)

    def on_runcmd(self):
        tmpCmd = self.cmdbox.get()
        print ("run cmd " + tmpCmd)
        if (tmpCmd.strip() == "update"):
            self.update_filelist()
        else:
            os.system("start " + tmpCmd)

    def on_enter_runcmd(self, event):
        tmpCmd = self.cmdbox.get()
        print ("run cmd enter " + tmpCmd)
        if (tmpCmd.strip() == "update"):
            self.update_filelist()
        else:
            os.system("start " + tmpCmd)

    def on_quit(self, event):
        print ("Bye")
        self.master.destroy()

    def on_downkey(self, event):
        if self.selection < self.listBox.size()-1:
            self.listBox.select_clear(self.selection)
            self.selection += 1
            self.listBox.select_set(self.selection)
    
    def on_upkey(self, event):
        if self.selection > 0:
            self.listBox.select_clear(self.selection)
            self.selection -= 1
            self.listBox.select_set(self.selection)
        elif self.listBox.size() == 1:
            self.selection = 1
        else:
            self.selection = self.listBox.curselection()[0]
    
    def on_enter_currfoler(self, event):
        prevDir = self.currDir
        nextDir = self.currfolder.get()
        print ("change currDir enter " + nextDir)

        if (nextDir.strip() != ""):
            try:
                os.chdir(nextDir)
                self.update_filelist()
            except:
                print ("Error : Unexpected folder!")
                self.currDir = prevDir
                os.chdir(self.currDir)
                self.update_filelist()
        else:
            os.system("start " + nextDir)

    def update_filelist(self):
        currdir = os.getcwd()
        self.currDir = currdir
        self.currfolder.delete(0,END)
        self.currfolder.insert(END,self.currDir)
        self.fileList= []
        fileList = os.listdir(currdir)
        
        for filename in fileList:
            fullfilename = os.path.join(currdir, filename)
            if os.path.isdir(fullfilename):
                #print ("[" + filename + "]"
                self.fileList.append("[" + filename + "]")
            else:
                #print filename
                self.fileList.append(filename)
        self.fileList.append("..") 
        self.fileList.sort()
        self.listBox.delete(0,END)
        for item in self.fileList:
            #print item
            #item = unicode(item,'cp949')
            self.listBox.insert(END, item)
        #print ("End5"
        self.selection = 0

    def on_enter(self, event):
        try:
            firstIndex = self.listBox.curselection()[0]
            self.value = self.fileList[int(firstIndex)]
            print (self.value)

            currdir = os.getcwd()
            filename = self.value[1:-1]
            fullfilename = os.path.join(currdir, filename)
            isFolder = os.path.isdir(fullfilename)

    
            if (self.value == ".."):
                print ("Move to ..")
                os.chdir("..")
                self.update_filelist()

            elif (self.value[0] == '[' and isFolder == True):
                 print ("Folder> " + fullfilename)
                 os.chdir(fullfilename)
                 self.update_filelist()
 
            elif ("exe." == self.value[:-5:-1]):
                self.on_runexe(self.value)
     
            elif ("yp." == self.value[:-4:-1].lower() or 
                  "wyp." ==  self.value[:-5:-1].lower()):
                self.on_runPython(self.value)

            elif ("txt." == self.value[:-5:-1].lower() or
                  "pac." == self.value[:-5:-1].lower() or 
                  "ppc." == self.value[:-5:-1].lower() or                  
                  "lmx." == self.value[:-5:-1].lower() or 
                  "gol." == self.value[:-5:-1].lower()):
                self.on_runtxt(self.value)

        except IndexError:
            self.value = None
            #print ("Error"

    def createWidgets(self):
        
        self.currfolder = Entry(self, width=100)
        self.currfolder.insert(END, self.currDir)
        self.currfolder.pack(padx=5, pady=5)
        self.currfolder.bind("<Return>", self.on_enter_currfoler)


        listFrame = Frame(self)
        listFrame.pack(side=TOP, padx=5, pady=5)
        
        scrollBar = Scrollbar(listFrame)
        scrollBar.pack(side=RIGHT, fill=Y)
        self.listBox = Listbox(listFrame, selectmode=SINGLE, width=100, height=20)
        self.listBox.pack(side=LEFT, fill=Y)
        scrollBar.config(command=self.listBox.yview)
        self.listBox.config(yscrollcommand=scrollBar.set)
        self.fileList.sort()
        for item in self.fileList:
            #item = unicode(item,'cp949')
            self.listBox.insert(END, item)

        self.listBox.bind("<Return>", self.on_enter)
        self.listBox.bind("<Down>", self.on_downkey)
        self.listBox.bind("<Up>", self.on_upkey)
        self.listBox.bind("<Double-Button-1>", self.on_enter)


        self.QUIT = Button(self)
        self.QUIT["text"] = "QUIT"
        self.QUIT["fg"]   = "red"
        self.QUIT["command"] =  self.quit
        self.QUIT.pack({"side": "left"})

        self.CMD = Button(self)
        self.CMD["text"] = "Cmd"
        self.CMD["fg"]   = "blue"
        self.CMD["command"] = self.on_cmd
        self.CMD.pack({"side": "left"})

        self.EXPLORER = Button(self)
        self.EXPLORER["text"] = "Explorer"
        self.EXPLORER["fg"]   = "blue"
        self.EXPLORER["command"] = self.on_runexplorer
        self.EXPLORER.pack({"side": "left"})


        self.PAINT = Button(self)
        self.PAINT["text"] = "Paint",
        self.PAINT["command"] = self.on_Paint
        self.PAINT.pack({"side": "left"})

        self.NOTE = Button(self)
        self.NOTE["text"] = "Note",
        self.NOTE["command"] = self.on_Note
        self.NOTE.pack({"side": "left"})

        self.cmdStr = StringVar()
        self.cmdbox = Entry(self, width=60, textvariable=self.cmdStr)
        self.cmdbox.pack({"side": "left"})
        self.cmdbox.bind("<Return>", self.on_enter_runcmd)

        self.RUN = Button(self)
        self.RUN["text"] = "Run",
        self.RUN["command"] = self.on_runcmd
        self.RUN.pack({"side": "left"})

        self.DELETE_CMD = Button(self)
        self.DELETE_CMD["text"] = "Clear",
        self.DELETE_CMD["command"] = self.on_runcmd_delete
        self.DELETE_CMD.pack({"side": "left"})


    def __init__(self, master=None, dir=None, list=[]):
        Frame.__init__(self, master)
        self.fileList = list[:]
        self.value = None
        self.currDir = dir
        self.selection = 0
        self.pack()
        self.createWidgets()
        self.master.bind("<Escape>", self.on_quit)

if __name__ == '__main__':
    root = Tk()
    root.wm_title("ChoboFileManaer V0.2018.04.29a")

    currdir = os.getcwd()
    tmpfileList = os.listdir(currdir)

    fileList = []
    for filename in tmpfileList:
        fullfilename = os.path.join(currdir, filename)
        if os.path.isdir(fullfilename):
            fileList.append("[" + filename + "]")
        else:
            fileList.append(filename)

    fileList.append("..")

    app = ChoboFileManaer(master=root, dir=currdir, list=fileList)
    app.mainloop()