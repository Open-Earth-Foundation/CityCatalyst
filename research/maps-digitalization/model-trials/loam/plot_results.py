"""Standalone evaluation figure; no model or settings changes."""
import os,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
os.environ['MPLCONFIGDIR']=str(HERE/'cache/matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
def main():
    data=json.loads((HERE/'metrics.json').read_text())
    names=[];scores=[]
    for hazard in ['heat','flood','landslide','drought','arbovirus','storm']:
        row=data['layers'].get('porto-'+hazard,{})
        if row.get('status')=='succeeded':names.append(hazard.capitalize());scores.append(row['metrics']['scores']['test'])
    if not scores:return
    correct=np.array([s['correct_class_count']/s['eligible']*100 for s in scores]);wrong=np.array([(s['common']-s['correct_class_count'])/s['eligible']*100 for s in scores]);missing=np.array([s['missing']/s['eligible']*100 for s in scores])
    fig,ax=plt.subplots(figsize=(9.4,4.6),dpi=150)
    y=np.arange(len(scores))
    ax.barh(y,correct,color='#087f8c',label='Correct and present',height=.62)
    ax.barh(y,wrong,left=correct,color='#e9a64b',label='Wrong class, present',height=.62)
    ax.barh(y,missing,left=correct+wrong,color='#d2d6dc',label='Missing',height=.62)
    for i,s in enumerate(scores):ax.text(101.5,i,f'{s["correct_class_count"]}/{s["eligible"]}',va='center',fontsize=9,color='#354152')
    ax.set_yticks(y,names);ax.invert_yaxis();ax.set_xlim(0,119);ax.set_xticks([0,25,50,75,100],[f'{n}%' for n in [0,25,50,75,100]])
    ax.tick_params(axis='both',length=0,pad=8);ax.spines[['top','right','left','bottom']].set_visible(False)
    ax.set_title('LOAM · Porto test-block coverage',loc='left',weight='bold',fontsize=15,pad=24)
    ax.text(0,1.04,'Correct / eligible cell counts are shown at right.',transform=ax.transAxes,fontsize=9,color='#52606d')
    ax.legend(loc='upper left',bbox_to_anchor=(-.01,-.12),ncol=3,frameon=False,fontsize=9)
    fig.text(.12,.025,'250 m cells; missing is unsuccessful. Same-author raster reference. Previously audited blocks.\nOfficial checkpoint, mode-6 preprocessing, CPU strips; not independent hazard validation.',fontsize=8,color='#52606d')
    fig.subplots_adjust(left=.14,right=.97,top=.82,bottom=.24)
    dest=HERE/'evidence';dest.mkdir(exist_ok=True)
    fig.savefig(dest/'porto-test-coverage.png',dpi=150);fig.savefig(dest/'porto-test-coverage.svg');plt.close(fig)
    print('SAVED_COVERAGE_FIGURE',len(scores),'hazards')
if __name__=='__main__':main()
