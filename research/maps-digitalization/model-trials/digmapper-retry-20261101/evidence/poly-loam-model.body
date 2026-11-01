""" Full assembly of the parts to form the complete network """

from .loam_parts import *


class LOAM(nn.Module):
    def __init__(self, n_channels, n_classes, bilinear=False):
        super(LOAM, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        self.bilinear = bilinear

        self.inc = (DoubleConv(n_channels, 64))
        self.down1 = (Down(64, 128))
        self.down2 = (Down(128, 256))
        self.down3 = (Down(256, 512))
        factor = 2 if bilinear else 1
        self.down4 = (Down(512, 1024 // factor))

        self.sa = (sa_layer(1024))
        self.fc1 = (Dense(32, 64)) # 10 * 3 + 2
        self.fc2 = (Dense(64, 128))
        self.fc3 = (Dense(128, 64)) # 16

        self.fm1 = (Dense(9, 32))
        self.fm2 = (Dense(32, 64)) # 16

        self.mf = (mf_layer(1024))

        self.up1 = (Up(1024, 512 // factor, bilinear))
        self.up2 = (Up(512, 256 // factor, bilinear))
        self.up3 = (Up(256, 128 // factor, bilinear))
        self.up4 = (Up(128, 64, bilinear))
        self.outc = (OutConv(64, n_classes))

        

    def forward(self, x, zc, zm):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x6 = self.sa(x5)
        zc1 = self.fc1(zc)
        zc2 = self.fc2(zc1)
        zc3 = self.fc3(zc2)

        zm1 = self.fm1(zm)
        zm2 = self.fm2(zm1)

        y1 = self.mf(x6, zc3, zm2)

        x = self.up1(y1, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits

    def use_checkpointing(self):
        self.inc = torch.utils.checkpoint(self.inc)
        self.down1 = torch.utils.checkpoint(self.down1)
        self.down2 = torch.utils.checkpoint(self.down2)
        self.down3 = torch.utils.checkpoint(self.down3)
        self.down4 = torch.utils.checkpoint(self.down4)
        self.sa = torch.utils.checkpoint(self.sa)
        self.fc1 = torch.utils.checkpoint(self.fc1)
        self.fc2 = torch.utils.checkpoint(self.fc2)
        self.fc3 = torch.utils.checkpoint(self.fc3)
        self.fm1 = torch.utils.checkpoint(self.fm1)
        self.fm2 = torch.utils.checkpoint(self.fm2)
        self.mf = torch.utils.checkpoint(self.mf)
        self.up1 = torch.utils.checkpoint(self.up1)
        self.up2 = torch.utils.checkpoint(self.up2)
        self.up3 = torch.utils.checkpoint(self.up3)
        self.up4 = torch.utils.checkpoint(self.up4)
        self.outc = torch.utils.checkpoint(self.outc)