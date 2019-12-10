import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../../services/api.service';
import { TimerService } from '../../../services/timer.service';
import { DataService } from '../../../services/data.service'
import { DatabaseService } from '../../../services/database.service'
import { trigger, state, style, animate, transition } from '@angular/animations';
import { HttpService } from '../../../services/http.service'
import { WorkItemData } from 'app/models/RemoteAccount';
import { shell } from 'electron';
import { ToasterService } from '../../../services/toaster.service'
import { AccountService } from '../../../services/account.service'
import { Router } from '@angular/router';
import { newIssue } from 'app/models/RemoteAccount';

const electron = require('electron')

@Component({
  selector: 'app-boards',
  templateUrl: './boards.component.html',
  styleUrls: ['./boards.component.scss'],
  animations: [
    trigger('visibilityChanged', [
      state('shown', style({ maxHeight: '1000px', transition: 'max-height .3s ease-in', overflow: 'hidden' })),
      state('hidden', style({ maxHeight: '0', transition: 'max-height .3s ease-out', overflow: 'hidden'}))
    ])
  ]
})
export class BoardsComponent implements OnInit {
  public projects: any
  private projectId: String
  private issues: any
  private newItemProperties: any
  private workTypes: any
  private currentIssueId: String
  private unstoppedItem: any
  private allItemsFromDb: any
  public agiles: any
  public applyCommand: any
  private totalTimes: object
  private boardStates: Array<any> = []
  private issueHexColor: any
  private boardsChecked: boolean
  private newIssue: newIssue
  private currentAgile: object

  constructor(
    public api: ApiService,
    public timerService: TimerService,
    public dataService: DataService,
    public databaseService: DatabaseService,
    public httpService: HttpService,
    public toasterService: ToasterService,
    public account: AccountService,
    public router: Router
  ) {
    this.newItemProperties = {
      date: 0,
      duration: 0
    }
  }

  toggle(i) {
    if (this.agiles[i].issues != 0) {
      if (this.agiles[i].visiblityState === 'hidden')
        this.agiles[i].visiblityState = 'shown'
      else
        this.agiles[i].visiblityState = 'hidden'
      this.dataService.sendAgilesVisibility({name: this.agiles[i].name, state: this.agiles[i].visiblityState})
    }
  }

  ngOnInit() {
    if (!window.navigator.onLine) {
      this.toasterService.error("No internet connection")
    } else {
      this.init()
    }
  }

  public init() {
    this.api.getAllAgiles().then(
      data => {
        this.agiles = data
        this.agiles.forEach(agile => {
          this.getAgileVisibility(agile.name)
        })
      this.getItemsFromDb()
    })
    this.getAllBoardStates()
  }

  public showCommandModal(issue){
    this.currentAgile = undefined
    this.applyCommand = { id: issue, command:'' }
    document.getElementById('addIssue').style.display = 'block'
  }

  public showAddIssueModal(agile) {
    this.currentAgile = agile
    this.applyCommand = undefined
    console.log("agile", this.currentAgile)
    this.newIssue = new newIssue
    this.newIssue.project = this.currentAgile["projects"][0]["id"]
    document.getElementById('addIssue').style.display = 'block'
  }

  public hideAddIssueModal() {
    this.currentAgile = undefined
    document.getElementById('addIssue').style.display = "none"
  }

  public async createIssueOnBoard(data, board) {
    this.agiles.filter(agile => {
      if (agile.name == board){
        let state = agile.columnSettings.visibleValues[0].value;
        return this.api.createIssueOnBoard(data, board, state).then(() => this.init());
      }
    })
  }

  public async openInBrowser(url : string){
    var account = await this.api.accounts.Current();
    shell.openExternal(account.url + url);
  }

  async getAgileVisibility(boardName) {
    let account = await this.account.Current()
    this.databaseService.getBoardVisibilities(account["id"], boardName).then(boardVisibility => {
      if (boardVisibility.length === 0) {
        this.databaseService.initBoardVisibility(account["id"], boardName, 0).then( () => {
          this.getAgileVisibility(boardName)
        })
      }
      this.agiles.filter(agile => {
        if (agile.name == boardVisibility[0].boardName) {
          boardVisibility[0].visible == 1? agile.checked = true : agile.checked = false
        }
      })
    })
  }

  async getItemsFromDb() {
    let account = await this.account.Current()
    let that = this
    this.totalTimes = {}
    this.databaseService.getAllItems(account["id"]).then(data => {
      this.allItemsFromDb = data
      this.allItemsFromDb.forEach(function(row) {
        if (that.timerService.currentIssue == undefined && row.status == "start" && row.published == 0 && row.duration > 0) {
          that.dataService.sendUnstoppedItem(row)
        }
        let todayItems = []
        if (new Date(row.date).getDate() == new Date().getDate() && row.status == "stop") {
          todayItems.push(row)
        }
        todayItems.forEach(function(row) {
          if (!that.totalTimes.hasOwnProperty(row.issueid)) {
            that.totalTimes[row.issueid] = row.duration
          } else {
            that.totalTimes[row.issueid] += row.duration
          }
        })

      })
      this.getAllAgiles()
    })
  }

  public getAllAgiles() {
    let that = this
    this.agiles.forEach((agile, index) => {
      that.dataService.currentAgilesStates.subscribe(agilesStates => {
        agilesStates.forEach(agileState => {
          (agile.name == agileState)? agile.visiblityState = agileState.state : "shown"
        })
      })
      if (agile.visiblityState == '' ) {
        agile.visiblityState = 'shown'
      }
      if (agile.checked) {
        this.dataService.sendAgilesVisibility({name: agile.name, state: agile.visiblityState})
      }
      agile.issues = []
      this.getIssuesByAgile(agile.name, index)
    })
  }

  public getIssuesByAgile(agileName, index, after=0, max=10) {
    this.api.getIssuesByAgile(agileName).then(
      data => {
          this.httpService.loader = false
          this.issues = data
          this.prepareIssues(this.issues, agileName, index)
      }
    )
  }

  public showSuggestion(commNdItem: any){
    this.api.getCommandSuggestions(commNdItem.id,{command:commNdItem.command, max:5}).then( data => {
      console.log(data)
      this.applyCommand.suggestions = data;
    })
  }

  public executeCommand(commNdItem: any) {
    this.api.executeCommand(commNdItem.id,{command:commNdItem.command}).then( data => {
      this.applyCommand = undefined;
      document.getElementById('addIssue').style.display = "none";
      this.init();
    })
  }


  public prepareIssues = (issues, agileName, agileIndex) => {
    let that = this
    console.log("issues", issues, )
    console.log(" agileName", agileName)
    console.log("agileIndex", agileIndex)
    let tempIssues = []
    issues.issue.forEach((issue, index) => {
      var newIssue = {
        id: issue.id,
        agile: agileName,
        comment: {},
        hasComment: undefined,
        hasDescription: undefined,
        entityId: issue.entityId,
        jiraId: issue.jiraId,
        field: {},
        tag: issue.tag,
        todaysTime: that.totalTimes[issue.id] || 0
      }
      issue.comment.forEach((comm, key) => {
        newIssue.comment[key] = comm
      })
      issue.field.forEach((field, index) => {
        newIssue.field[field.name.replace(" ", "")] = field.value
      })
      newIssue.field["Est"] = this.convertEstimate(newIssue.field["Estimation"])
      newIssue.hasComment = Object.keys(newIssue.comment).length == 0? false : Object.keys(newIssue.comment).length
      newIssue.hasDescription = newIssue.field.hasOwnProperty('description')? true : false
      console.log("newIssue", newIssue)
      tempIssues.push(newIssue)
    })
    console.log("tempIssues", tempIssues)
    this.agiles[agileIndex].issues = tempIssues
    console.log("prepared agiles", this.agiles)
    this.isAnyBoardVisible()
    this.prepareAndSaveUniqueStates(agileIndex)
  }

  async prepareAndSaveUniqueStates(agileIndex) {
    let states = []
    let currentAccount = await this.account.Current()
    this.agiles[agileIndex].issues.forEach((issue) => {
      states.push(issue.field.State[0])
      this.databaseService.saveBoardStates(currentAccount["id"], this.agiles[agileIndex].name, issue.field.Priority[0])
    })
  }

  public isAnyBoardVisible() {
    this.agiles.forEach((agile) => {
      if (agile.checked) {
        this.boardsChecked = true
      }
    })
  }

  public priorityClass(issue) {
    this.boardStates.filter(board => {
      if (board.boardName == issue.agile && board.state == issue.field.Priority[0]) {
        return issue.field.Priority[1] = board.hexColor
      }
    })
  }

  public convertEstimate = (est) => {
    if (est === undefined) {
      return "No est"
    } else {
      let estMins = Number(est)
      let minutes = estMins % 60
      let totalHours = Math.floor (estMins / 60)
      let hours = totalHours % 8
      let days = Math.floor (totalHours / 8)
      if (totalHours === 0) {
        return `${minutes}m`
      } else if (days === 0) {
        return (minutes === 0) ? `${hours}h` : `${hours}h ${minutes}m`
      } else {
        if (minutes === 0) {
          return (hours === 0) ? `${days}d` : `${days}d ${hours}h`
        } else {
          return (hours === 0) ? `${days}d ${minutes}m` : `${days}d ${hours}h ${minutes}m`
        }
      }
    }
  }

  async startTracking(issue: any, duration?) {
    console.log('issue in start tracking', issue)
    let account = await this.account.Current()
    var item = new WorkItemData;
    item.accountId = account["id"],
    item.issueId = issue.id;
    item.duration = duration || 0;
    item.date = issue.date || Date.now();
    item.startDate = issue.startDate || Date.now();
    item.summary = issue.field.summary;
    item.agile = issue.agile
    console.log("issue.id ", issue.id)
    console.log("summary", issue.field)
    this.timerService.startItem(item);
  }

  public sendWorkItems = (item: WorkItemData) => {
    this.timerService.startItem(item).then(
      (response) => {
        this.databaseService.setIsPublished(item.date)
        this.databaseService.setIsStopped(item.date)
      },
      (err) => {
      }
    )
  }

  public getTimetrackingWorkTypes = (issue) => {
    let projectId = issue.id.split("-")[0]
    this.api.getTimetrackingWorkTypes(projectId).then(
      data => {
        this.workTypes = data
      }
    )
  }

  async getAllBoardStates() {
    let account = await this.account.Current()
    await this.databaseService.getAllBoardStates(account['id']).then(data => {
      this.boardStates = data
    })
  }

}
