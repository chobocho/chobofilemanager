from Tkinter import *
import os

'''
2017.08.20
'''

class ChoboFileManaer(Frame):
    def on_cmd(self):
        print "run command"
        os.system("start cmd")

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
    
    def on_enter(self, event):

        try:
            firstIndex = self.listBox.curselection()[0]
            self.value = self.fileList[int(firstIndex)]
            print self.value
            if (self.value == ".."):
               print "Move to .."
               self.fileList= []
               os.chdir("..")
               currdir = os.getcwd()
               print currdir
               fileList = os.listdir(currdir)
              

               for filename in fileList:
                   fullfilename = os.path.join(currdir, filename)
                   if os.path.isdir(fullfilename):
                       #print "[" + filename + "]"
                       self.fileList.append("[" + filename + "]")
                   else:
                       print filename
                       self.fileList.append(filename)

               self.fileList.append("..") 
               self.fileList.sort()
               self.listBox.delete(0,END)
              
               for item in self.fileList:
                   self.listBox.insert(END, item)

               self.selection = 0
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
            self.listBox.insert(END, item)

        self.listBox.bind("<Return>", self.on_enter)
        self.listBox.bind("<Down>", self.on_downkey)
        self.listBox.bind("<Up>", self.on_upkey)


        self.QUIT = Button(self)
        self.QUIT["text"] = "QUIT"
        self.QUIT["fg"]   = "red"
        self.QUIT["command"] =  self.quit

        self.QUIT.pack({"side": "left"})

        self.RUN = Button(self)
        self.RUN["text"] = "Run",
        self.RUN["command"] = self.on_cmd

        self.RUN.pack({"side": "left"})

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
    fileList = os.listdir(currdir)
    fileList.append("..")

    app = ChoboFileManaer(master=root, list=fileList)
    app.mainloop()