from Tkinter import *
import os

'''
Start  : 2017.08.20
Update : 2017.08.20d
'''

class ChoboFileManaer(Frame):
    def on_cmd(self):
        print "run command"
        os.system("start cmd")

    def on_runexe(self, exefile):
        print "run " + exefile
        os.system("start " + exefile)

    def on_runcmd(self):
        tmpCmd = self.cmdbox.get()
        print "run cmd " + tmpCmd
        os.system("start " + tmpCmd)

    def on_runcmd_delete(self):
        print "on_runcmd_delete"
        self.cmdbox.delete(0,END)

    def on_enter_runcmd(self, event):
        tmpCmd = self.cmdbox.get()
        print "run cmd enter" + tmpCmd
        os.system("start " + tmpCmd)

    def on_quit(self, event):
        print "Bye"
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
    
    def update_filelist(self):
        currdir = os.getcwd()
        print currdir
        self.fileList= []
        fileList = os.listdir(currdir)
        
        for filename in fileList:
            fullfilename = os.path.join(currdir, filename)
            if os.path.isdir(fullfilename):
                #print "[" + filename + "]"
                self.fileList.append("[" + filename + "]")
            else:
                #print filename
                self.fileList.append(filename)
        #print "End1"
        self.fileList.append("..") 
        #print "End2"
        self.fileList.sort()
        #print "End3"
        self.listBox.delete(0,END)
        #print "End4"
        for item in self.fileList:
            #print item
            item = unicode(item,'cp949')
            self.listBox.insert(END, item)
        #print "End5"
        self.selection = 0

    def on_enter(self, event):

        try:
            firstIndex = self.listBox.curselection()[0]
            self.value = self.fileList[int(firstIndex)]
            print self.value
            if (self.value[0] == '['):
                 currdir = os.getcwd()
                 filename = self.value[1:-1]
                 fullfilename = os.path.join(currdir, filename)
                 print fullfilename
                 if os.path.isdir(fullfilename):
                    os.chdir(fullfilename)
                    self.update_filelist()
                    
            elif (self.value == ".."):
               print "Move to .."
               self.fileList= []
               os.chdir("..")
               self.update_filelist()
 
            elif ("exe." == self.value[:-5:-1]):
               self.on_runexe(self.value)

        except IndexError:
            self.value = None
            #print "Error"

    def createWidgets(self):
        
        #Label(self, text="ChoboFileManaer").pack(padx=5, pady=5)


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
            item = unicode(item,'cp949')
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
        self.CMD["text"] = "Cmd",
        self.CMD["command"] = self.on_cmd

        self.CMD.pack({"side": "left"})

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


    def __init__(self, master=None, list=[]):
        Frame.__init__(self, master)
        self.fileList = list[:]
        self.value = None
        self.selection = 0
        self.pack()
        self.createWidgets()
        self.master.bind("<Escape>", self.on_quit)

if __name__ == '__main__':
    root = Tk()
    root.wm_title("ChoboFileManaer")

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

    app = ChoboFileManaer(master=root, list=fileList)
    app.mainloop()